;; Rendezvous harness for `bxl-vault-v2`.
;;
;;   npm run fuzz:invariant   # the public functions, then the invariants
;;   npm run fuzz:test        # the private `test-` properties
;;
;; `rv` only calls the public functions of the contract it fuzzes, and the
;; vault cannot drive the mock pool (the mock calls the vault, so the vault
;; calling the mock would be a circular dependency). So the fuzzer targets
;; this contract instead: each public function below forwards to the vault or
;; to the mock pool, and records what it did in ghost state. The invariants
;; read the vault only through its public read-only functions.
;;
;; The forwarding is transparent to the vault: it identifies users and admins
;; by `tx-sender`, which a `contract-call?` keeps. Only `contract-caller`
;; changes, and the vault checks that only in `pool-withdrawn` (the adapter).
;;
;; See docs/invariants.md for what each invariant means.

(use-trait sbtc-pool-trait .sbtc-pool-trait.sbtc-pool-trait)
(use-trait signer-manager-trait 'SP000000000000000000002Q6VF78.pox-5.signer-manager-trait)

(define-constant ERR_NOT_FOUND (err u404))

;; Every contract in this project that implements `sbtc-pool-trait`, so every
;; contract the vault can ever have deployed into here.
(define-constant POOLS (list .mock-sbtc-pool .bxl-pool-stbtc .bxl-pool-xverse .bxl-pool-bond))

(define-constant MIN_DELAY u1000)
;; Delays above the minimum, so some requests wait longer.
(define-constant MAX_DELAY u3000)
;; Deposits, donations and pool gains stay well inside the simnet balances.
(define-constant MAX_AMOUNT u10000000)

;;; Rendezvous context

(define-map context
  (string-ascii 100)
  { called: uint }
)

(define-private (update-context
    (function-name (string-ascii 100))
    (called uint)
  )
  (ok (map-set context function-name { called: called }))
)

;;; Ghost state: what the fuzzer did, as seen from outside the vault

;; sBTC each user deposited, and sBTC paid out to them by `withdraw-finalize`.
(define-map deposited-sats
  principal
  uint
)
(define-map paid-sats
  principal
  uint
)
(define-map deposited-ustx
  principal
  uint
)
(define-map withdrawn-ustx
  principal
  uint
)

;; Principal sent into each pool by `deploy`, in total.
(define-map deployed-into
  principal
  {
    sats: uint,
    ustx: uint,
  }
)

;; Burn height at which each open request was last set.
(define-map request-set-at
  uint
  uint
)

;; Pool value lost on entry: what `deploy` sent minus what the pool's value
;; went up by. The one way a vault action may lower its coverage.
(define-data-var entry-fees uint u0)

;; Requests paid to a user before their delay was over without an admin.
(define-data-var early-finalizations uint u0)

;;; User operations
;;
;; Random amounts and ids are folded into ranges that can succeed (what the
;; caller holds, the ids issued so far), so the run reaches deep states rather
;; than bouncing on balances. The vault's own checks still see every value.

(define-public (deposit (amount uint))
  (let ((sats (mod amount MAX_AMOUNT)))
    (try! (contract-call? .bxl-vault-v2 deposit sats))
    (map-set deposited-sats tx-sender (+ (get-deposited-sats tx-sender) sats))
    (ok true)
  )
)

(define-public (withdraw-request
    (amount uint)
    (delay uint)
  )
  (let ((request-id (try! (contract-call? .bxl-vault-v2 withdraw-request
      (up-to amount (get-bxl-btc tx-sender)) (mod delay MAX_DELAY)
    ))))
    (map-set request-set-at request-id burn-block-height)
    (ok request-id)
  )
)

;; Usually the caller's own request; otherwise any issued id, which the vault
;; must refuse.
(define-public (withdraw-update
    (n uint)
    (amount uint)
    (delay uint)
  )
  (let (
      (request-id (default-to (pick-request-id n)
        (contract-call? .bxl-vault-v2 get-withdrawal-request-id tx-sender)
      ))
      (new-amount (mod amount (+ u1 (get-bxl-btc tx-sender) (get-transit tx-sender))))
    )
    (try! (contract-call? .bxl-vault-v2 withdraw-update request-id new-amount
      (mod delay MAX_DELAY)
    ))
    (if (is-eq new-amount u0)
      (map-delete request-set-at request-id)
      (map-set request-set-at request-id burn-block-height)
    )
    (ok request-id)
  )
)

(define-public (withdraw-finalize (n uint))
  (let (
      (request-id (pick-request-id n))
      (request (unwrap! (contract-call? .bxl-vault-v2 get-withdrawal-request request-id)
        ERR_NOT_FOUND
      ))
      (user (get user request))
      (by-admin (contract-call? .bxl-vault-v2 is-admin tx-sender))
      (amount (try! (contract-call? .bxl-vault-v2 withdraw-finalize request-id)))
    )
    (map-set paid-sats user (+ (get-paid-sats user) amount))
    (map-delete request-set-at request-id)
    (if (or by-admin (> burn-block-height (get opens-at request)))
      true
      (var-set early-finalizations (+ (var-get early-finalizations) u1))
    )
    (ok amount)
  )
)

(define-public (deposit-stx (amount uint))
  (let ((ustx (mod amount MAX_AMOUNT)))
    (try! (contract-call? .bxl-vault-v2 deposit-stx ustx))
    (map-set deposited-ustx tx-sender (+ (get-deposited-ustx tx-sender) ustx))
    (ok true)
  )
)

(define-public (withdraw-stx (amount uint))
  (let ((ustx (up-to amount (get-bxl-stx tx-sender))))
    (try! (contract-call? .bxl-vault-v2 withdraw-stx ustx))
    (map-set withdrawn-ustx tx-sender (+ (get-withdrawn-ustx tx-sender) ustx))
    (ok true)
  )
)

;; Anyone may send the vault sBTC or STX; it is surplus.
(define-public (donate-sbtc (amount uint))
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer
    (mod amount MAX_AMOUNT) tx-sender .bxl-vault-v2 none
  )
)

(define-public (donate-stx (amount uint))
  (stx-transfer? (mod amount MAX_AMOUNT) tx-sender .bxl-vault-v2)
)

;;; Admin operations

;; The vault needs every pool holding principal, once each. The harness
;; passes all of them: one without principal counts as zero. The amount is
;; anything up to the vault's balance, so the surplus check is what decides.
(define-public (admin-sbtc-transfer
    (amount uint)
    (recipient principal)
  )
  (contract-call? .bxl-vault-v2 admin-sbtc-transfer
    (up-to amount (get-vault-sbtc)) recipient
    (list .mock-sbtc-pool .bxl-pool-stbtc .bxl-pool-xverse .bxl-pool-bond)
  )
)

(define-public (admin-stx-transfer
    (amount uint)
    (recipient principal)
  )
  (contract-call? .bxl-vault-v2 admin-stx-transfer
    (up-to amount (stx-get-balance .bxl-vault-v2)) recipient
    (list .mock-sbtc-pool .bxl-pool-stbtc .bxl-pool-xverse .bxl-pool-bond)
  )
)

(define-public (admin-set-admin
    (admin principal)
    (enable bool)
  )
  (contract-call? .bxl-vault-v2 admin-set-admin admin enable)
)

;; Takes the trait so the fuzzer picks real pools rather than wallets.
(define-public (admin-set-pool
    (pool <sbtc-pool-trait>)
    (enable bool)
  )
  (contract-call? .bxl-vault-v2 admin-set-pool (contract-of pool) enable)
)

(define-public (admin-set-manager
    (manager <signer-manager-trait>)
    (enable bool)
  )
  (contract-call? .bxl-vault-v2 admin-set-manager (contract-of manager) enable)
)

(define-public (deploy
    (pool <sbtc-pool-trait>)
    (amount-sats uint)
    (amount-ustx uint)
  )
  (let (
      (pool-id (contract-of pool))
      (sats (mod amount-sats (+ u1 (get-vault-sbtc))))
      (ustx (mod amount-ustx (+ u1 (stx-get-balance .bxl-vault-v2))))
      (value-before (get sats (try! (contract-call? pool get-value))))
      (deployed (get-deployed-into pool-id))
    )
    (try! (contract-call? .bxl-vault-v2 deploy pool sats ustx))
    (let (
        (value-after (get sats (try! (contract-call? pool get-value))))
        (gained (if (> value-after value-before)
          (- value-after value-before)
          u0
        ))
      )
      (if (> sats gained)
        (var-set entry-fees (+ (var-get entry-fees) (- sats gained)))
        true
      )
    )
    (map-set deployed-into pool-id {
      sats: (+ (get sats deployed) sats),
      ustx: (+ (get ustx deployed) ustx),
    })
    (ok true)
  )
)

(define-public (collect-rewards (pool <sbtc-pool-trait>))
  (contract-call? .bxl-vault-v2 collect-rewards pool)
)

(define-public (stake
    (manager <signer-manager-trait>)
    (amount uint)
    (cycles uint)
  )
  (contract-call? .bxl-vault-v2 stake manager amount cycles)
)

(define-public (unstake (old-manager <signer-manager-trait>))
  (contract-call? .bxl-vault-v2 unstake old-manager)
)

;;; The mock pool: gains, rewards, losses and withdrawals

(define-public (mock-add-sbtc
    (gain uint)
    (reward uint)
  )
  (contract-call? .mock-sbtc-pool add-sbtc (mod gain MAX_AMOUNT)
    (mod reward MAX_AMOUNT)
  )
)

(define-public (mock-set-loss (sats uint))
  (contract-call? .mock-sbtc-pool set-loss (mod sats MAX_AMOUNT))
)

;; Admin only (checked by the mock). Hands sBTC and all STX back through
;; `pool-withdrawn`.
(define-public (mock-withdraw (sats uint))
  (contract-call? .mock-sbtc-pool withdraw sats)
)

;;; The vault's own bond seat. pox-5's bond calls (`register`,
;;; `unstake-sbtc`) need a bond set up by the bond admin, which no fuzzer
;;; account is; the vitest suite covers them. Here the seat holds idle
;;; principal, gets paid like a seat would, and hands both back.

;; Admin only (checked by the adapter).
(define-public (bond-withdraw)
  (contract-call? .bxl-pool-bond withdraw u0)
)

;; Anyone may pay the seat, as max500's permissionless claim does.
(define-public (bond-pay-rewards (sats uint))
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer
    (mod sats MAX_AMOUNT) tx-sender .bxl-pool-bond none
  )
)

;;; Properties (rv property mode)
;;
;; The clarunit flows the vitest suites replaced, generalised to random amounts
;; and callers. Each returns (ok true) when the property holds, (ok false) when
;; it does not apply to this caller or state (discarded), and an error code
;; when it is broken. They call the vault directly, not through the harness
;; functions above, so amounts are exact; property and invariant runs use
;; separate simnets, so the ghost state does not need them.

;; Was `test-happy-path` (sBTC). A deposit mints bxl-btc 1:1 and moves the
;; sBTC into the vault; a request moves bxl-btc into transit and opens at least
;; MIN_DELAY blocks later; cancelling it moves it back.
(define-private (test-deposit-request-cancel
    (amount uint)
    (part uint)
  )
  (let (
      (user tx-sender)
      (sats (+ u1 (mod amount MAX_AMOUNT)))
      (user-sbtc (get-sbtc user))
      (vault-sbtc (get-vault-sbtc))
      (bxl (get-bxl-btc user))
      (transit (get-transit user))
    )
    (if (or
        (is-some (contract-call? .bxl-vault-v2 get-withdrawal-request-id user))
        (< user-sbtc sats)
      )
      (ok false)
      (begin
        (unwrap! (contract-call? .bxl-vault-v2 deposit sats) (err u1001))
        (asserts! (is-eq (get-bxl-btc user) (+ bxl sats)) (err u1002))
        (asserts! (is-eq (get-sbtc user) (- user-sbtc sats)) (err u1003))
        (asserts! (is-eq (get-vault-sbtc) (+ vault-sbtc sats)) (err u1004))
        (let (
            (requested (up-to part (+ bxl sats)))
            (request-id (unwrap! (contract-call? .bxl-vault-v2 withdraw-request requested u0)
              (err u1005)
            ))
            (request (unwrap!
              (contract-call? .bxl-vault-v2 get-withdrawal-request request-id)
              (err u1006)
            ))
          )
          (asserts!
            (is-eq request-id (contract-call? .bxl-vault-v2 get-last-request-id))
            (err u1007)
          )
          (asserts!
            (is-eq request {
              user: user,
              amount: requested,
              opens-at: (+ burn-block-height MIN_DELAY),
            })
            (err u1008)
          )
          (asserts! (is-eq (get-bxl-btc user) (- (+ bxl sats) requested))
            (err u1009)
          )
          (asserts! (is-eq (get-transit user) (+ transit requested)) (err u1010))
          (unwrap!
            (contract-call? .bxl-vault-v2 withdraw-update request-id u0 u0)
            (err u1011)
          )
          (asserts! (is-eq (get-bxl-btc user) (+ bxl sats)) (err u1012))
          (asserts! (is-eq (get-transit user) transit) (err u1013))
          (asserts!
            (is-none (contract-call? .bxl-vault-v2 get-withdrawal-request-id user))
            (err u1014)
          )
          (ok true)
        )
      )
    )
  )
)

;; Was `test-happy-path` (STX). STX comes back at once, in any split, 1:1.
(define-private (test-stx-round-trip
    (amount uint)
    (part uint)
  )
  (let (
      (user tx-sender)
      (ustx (+ u1 (mod amount MAX_AMOUNT)))
      (first-out (up-to part ustx))
      (user-stx (stx-get-balance user))
      (vault-stx (stx-get-balance .bxl-vault-v2))
      (bxl (get-bxl-stx user))
    )
    (unwrap! (contract-call? .bxl-vault-v2 deposit-stx ustx) (err u1101))
    (asserts! (is-eq (get-bxl-stx user) (+ bxl ustx)) (err u1102))
    (asserts! (is-eq (stx-get-balance .bxl-vault-v2) (+ vault-stx ustx))
      (err u1103)
    )
    (unwrap! (contract-call? .bxl-vault-v2 withdraw-stx first-out) (err u1104))
    (if (> ustx first-out)
      (unwrap! (contract-call? .bxl-vault-v2 withdraw-stx (- ustx first-out))
        (err u1105)
      )
      true
    )
    (asserts! (is-eq (get-bxl-stx user) bxl) (err u1106))
    (asserts! (is-eq (stx-get-balance user) user-stx) (err u1107))
    (asserts! (is-eq (stx-get-balance .bxl-vault-v2) vault-stx) (err u1108))
    (ok true)
  )
)

;; Was `test-unhappy-path`: a request above the user's bxl-btc fails with u1
;; and changes nothing.
(define-private (test-request-above-balance-fails (extra uint))
  (let (
      (user tx-sender)
      (bxl (get-bxl-btc user))
      (transit (get-transit user))
      (last (contract-call? .bxl-vault-v2 get-last-request-id))
    )
    (if (is-some (contract-call? .bxl-vault-v2 get-withdrawal-request-id user))
      (ok false)
      (begin
        (asserts!
          (is-eq
            (contract-call? .bxl-vault-v2 withdraw-request
              (+ bxl u1 (mod extra MAX_AMOUNT)) u0
            )
            (err u1)
          )
          (err u1201)
        )
        (asserts! (is-eq (get-bxl-btc user) bxl) (err u1202))
        (asserts! (is-eq (get-transit user) transit) (err u1203))
        (asserts! (is-eq (contract-call? .bxl-vault-v2 get-last-request-id) last)
          (err u1204)
        )
        (ok true)
      )
    )
  )
)

;; Was `test-unhappy-path`: a user with an open request cannot open a second
;; one (u403), whatever the amount.
(define-private (test-second-request-fails (amount uint))
  (let (
      (user tx-sender)
      (open-id (contract-call? .bxl-vault-v2 get-withdrawal-request-id user))
    )
    (if (or (is-some open-id) (< (get-sbtc user) u2))
      (ok false)
      (begin
        (unwrap! (contract-call? .bxl-vault-v2 deposit u2) (err u1301))
        (let ((request-id (unwrap! (contract-call? .bxl-vault-v2 withdraw-request u1 u0)
            (err u1302)
          )))
          (asserts!
            (is-eq
              (contract-call? .bxl-vault-v2 withdraw-request
                (up-to amount (get-bxl-btc user)) u0
              )
              (err u403)
            )
            (err u1303)
          )
          (asserts!
            (is-eq (contract-call? .bxl-vault-v2 get-withdrawal-request-id user)
              (some request-id)
            )
            (err u1304)
          )
          (unwrap!
            (contract-call? .bxl-vault-v2 withdraw-update request-id u0 u0)
            (err u1305)
          )
          (ok true)
        )
      )
    )
  )
)

;; Was `test-unhappy-path`: an STX withdrawal above the user's bxl-stx fails
;; with u1.
(define-private (test-stx-withdraw-above-balance-fails (extra uint))
  (let (
      (user tx-sender)
      (bxl (get-bxl-stx user))
    )
    (asserts!
      (is-eq
        (contract-call? .bxl-vault-v2 withdraw-stx
          (+ bxl u1 (mod extra MAX_AMOUNT))
        )
        (err u1)
      )
      (err u1401)
    )
    (asserts! (is-eq (get-bxl-stx user) bxl) (err u1402))
    (ok true)
  )
)

;; Was `test-withdraw-admin-fails`: even an admin cannot take one sat more
;; than the surplus (u500).
(define-private (test-admin-cannot-take-principal (extra uint))
  (let (
      (vault-sbtc (get-vault-sbtc))
      (amount (+ (get-sbtc-surplus) u1 (mod extra MAX_AMOUNT)))
    )
    (if (not (contract-call? .bxl-vault-v2 is-admin tx-sender))
      (ok false)
      (begin
        (asserts!
          (is-eq
            (contract-call? .bxl-vault-v2 admin-sbtc-transfer amount tx-sender
              (list
                .mock-sbtc-pool .bxl-pool-stbtc .bxl-pool-xverse .bxl-pool-bond
              ))
            (err u500)
          )
          (err u1501)
        )
        (asserts! (is-eq (get-vault-sbtc) vault-sbtc) (err u1502))
        (ok true)
      )
    )
  )
)

;; Was `test-withdraw-admin`: sBTC sent to the vault is surplus, and an admin
;; can take exactly that back out without touching what users are owed.
(define-private (test-admin-can-take-yield (amount uint))
  (let (
      (admin tx-sender)
      (sats (+ u1 (mod amount MAX_AMOUNT)))
      (vault-sbtc (get-vault-sbtc))
      (claims (+ (get-bxl-btc-supply) (get-bxl-btc-transit-supply)))
    )
    (if (or
        (not (contract-call? .bxl-vault-v2 is-admin admin))
        (< (get-sbtc admin) sats)
        ;; Underwater: the yield first refills what users are owed.
        (< (+ vault-sbtc (get sats (get-pools-counted))) claims)
      )
      (ok false)
      (begin
        (unwrap!
          (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
            transfer sats admin .bxl-vault-v2 none
          )
          (err u1601)
        )
        (unwrap!
          (contract-call? .bxl-vault-v2 admin-sbtc-transfer sats admin
            (list
              .mock-sbtc-pool .bxl-pool-stbtc .bxl-pool-xverse .bxl-pool-bond
            ))
          (err u1602)
        )
        (asserts! (is-eq (get-vault-sbtc) vault-sbtc) (err u1603))
        (asserts!
          (is-eq (+ (get-bxl-btc-supply) (get-bxl-btc-transit-supply)) claims)
          (err u1604)
        )
        (ok true)
      )
    )
  )
)

;; A non-admin cannot move any sBTC out of the vault (u401).
(define-private (test-non-admin-cannot-transfer (amount uint))
  (if (contract-call? .bxl-vault-v2 is-admin tx-sender)
    (ok false)
    (begin
      (asserts!
        (is-eq
          (contract-call? .bxl-vault-v2 admin-sbtc-transfer amount tx-sender
            (list
              .mock-sbtc-pool .bxl-pool-stbtc .bxl-pool-xverse .bxl-pool-bond
            ))
          (err u401)
        )
        (err u1701)
      )
      (ok true)
    )
  )
)

;;; Invariants

;; A.1 Deployed totals are the sum of the pool records.
(define-read-only (invariant-deployed-matches-pools)
  (let (
      (total (fold add-principal POOLS {
        sats: u0,
        ustx: u0,
      }))
      (deployed (contract-call? .bxl-vault-v2 get-deployed))
    )
    (and
      (is-eq (get sats total) (get sats deployed))
      (is-eq (get ustx total) (get ustx deployed))
    )
  )
)

;; A.2 A user's bxl-btc-transit is the amount of their open request.
(define-read-only (invariant-transit-matches-request (user principal))
  (is-eq (get-transit user)
    (match (contract-call? .bxl-vault-v2 get-withdrawal-request-id user)
      request-id (match (contract-call? .bxl-vault-v2 get-withdrawal-request request-id)
        request (get amount request)
        u0
      )
      u0
    ))
)

;; A.3 The user index points at a request of that user ...
(define-read-only (invariant-user-index-points-to-own-request (user principal))
  (match (contract-call? .bxl-vault-v2 get-withdrawal-request-id user)
    request-id (match (contract-call? .bxl-vault-v2 get-withdrawal-request request-id)
      request (is-eq (get user request) user)
      false
    )
    true
  )
)

;; A.3, A.6 ... and every open request is in the index, with an id issued.
(define-read-only (invariant-request-is-indexed (n uint))
  (let (
      (last (contract-call? .bxl-vault-v2 get-last-request-id))
      (request-id (pick-request-id n))
    )
    (match (contract-call? .bxl-vault-v2 get-withdrawal-request request-id)
      request (and
        (> request-id u0)
        (<= request-id last)
        (is-eq
          (contract-call? .bxl-vault-v2 get-withdrawal-request-id
            (get user request)
          )
          (some request-id)
        )
      )
      true
    )
  )
)

;; A.4 Each user is owed exactly what they deposited and were not paid.
(define-read-only (invariant-user-sbtc-claim (user principal))
  (is-eq (+ (get-bxl-btc user) (get-transit user))
    (- (get-deposited-sats user) (get-paid-sats user))
  )
)

(define-read-only (invariant-user-stx-claim (user principal))
  (is-eq (get-bxl-stx user)
    (- (get-deposited-ustx user) (get-withdrawn-ustx user))
  )
)

;; A.5 There is always an admin.
(define-read-only (invariant-admins-remain)
  (>= (contract-call? .bxl-vault-v2 get-admin-count) u1)
)

;; B.7 The vault covers what users are owed in sBTC, except for pool entry
;; fees (measured on `deploy`) and losses in the pools (the mock's loss).
(define-read-only (invariant-sbtc-covers-claims)
  (>=
    (+ (get-vault-sbtc) (get sats (get-pools-counted)) (var-get entry-fees)
      (contract-call? .mock-sbtc-pool get-loss)
    )
    (+ (get-bxl-btc-supply) (get-bxl-btc-transit-supply))
  )
)

;; B.7 ... and in STX. Staked STX is still the vault's.
(define-read-only (invariant-stx-covers-claims)
  (let ((account (stx-account .bxl-vault-v2)))
    (>=
      (+ (get locked account) (get unlocked account)
        (get ustx (get-pools-counted))
      )
      (get-bxl-stx-supply)
    )
  )
)

;; B.9 A pool's recorded principal never exceeds what was deployed into it.
(define-read-only (invariant-principal-within-deployed)
  (fold principal-within-deployed POOLS true)
)

;; D.14 An open request opens at least MIN_DELAY blocks after it was set ...
(define-read-only (invariant-request-delay (n uint))
  (let ((request-id (pick-request-id n)))
    (match (contract-call? .bxl-vault-v2 get-withdrawal-request request-id)
      request (match (map-get? request-set-at request-id)
        set-at (>= (get opens-at request) (+ set-at MIN_DELAY))
        false
      )
      true
    )
  )
)

;; D.14 ... and only an admin can pay it out before then.
(define-read-only (invariant-no-early-finalization)
  (is-eq (var-get early-finalizations) u0)
)

;;; Helpers

;; What the vault holds above what users are owed in sBTC, as
;; `admin-sbtc-transfer` counts it; zero when it holds less.
(define-private (get-sbtc-surplus)
  (let (
      (held (+ (get-vault-sbtc) (get sats (get-pools-counted))))
      (owed (+ (get-bxl-btc-supply) (get-bxl-btc-transit-supply)))
    )
    (if (> held owed)
      (- held owed)
      u0
    )
  )
)

(define-private (get-sbtc (who principal))
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    get-balance who
  ))
)

(define-private (add-principal
    (pool principal)
    (acc {
      sats: uint,
      ustx: uint,
    })
  )
  (let ((recorded (contract-call? .bxl-vault-v2 get-pool-principal pool)))
    {
      sats: (+ (get sats acc) (get sats recorded)),
      ustx: (+ (get ustx acc) (get ustx recorded)),
    }
  )
)

(define-private (principal-within-deployed
    (pool principal)
    (ok-so-far bool)
  )
  (let (
      (recorded (contract-call? .bxl-vault-v2 get-pool-principal pool))
      (deployed (get-deployed-into pool))
    )
    (and
      ok-so-far
      (<= (get sats recorded) (get sats deployed))
      (<= (get ustx recorded) (get ustx deployed))
    )
  )
)

;; What the vault counts its pools as worth: each at the lower of its
;; recorded principal and its value, as `admin-sbtc-transfer` does. A pool
;; without principal counts as zero and is not asked for its value.
(define-private (get-pools-counted)
  (let (
      (mock (counted .mock-sbtc-pool
        (if (has-principal-id .mock-sbtc-pool)
          (unwrap-panic (contract-call? .mock-sbtc-pool get-value))
          {
            sats: u0,
            ustx: u0,
          }
        )))
      (stbtc (counted .bxl-pool-stbtc
        (if (has-principal-id .bxl-pool-stbtc)
          (unwrap-panic (contract-call? .bxl-pool-stbtc get-value))
          {
            sats: u0,
            ustx: u0,
          }
        )))
      (xverse (counted .bxl-pool-xverse
        (if (has-principal-id .bxl-pool-xverse)
          (unwrap-panic (contract-call? .bxl-pool-xverse get-value))
          {
            sats: u0,
            ustx: u0,
          }
        )))
      (bond (counted .bxl-pool-bond
        (if (has-principal-id .bxl-pool-bond)
          (unwrap-panic (contract-call? .bxl-pool-bond get-value))
          {
            sats: u0,
            ustx: u0,
          }
        )))
    )
    {
      sats: (+ (get sats mock) (get sats stbtc) (get sats xverse) (get sats bond)),
      ustx: (+ (get ustx mock) (get ustx stbtc) (get ustx xverse) (get ustx bond)),
    }
  )
)

(define-private (counted
    (pool principal)
    (value {
      sats: uint,
      ustx: uint,
    })
  )
  (let ((recorded (contract-call? .bxl-vault-v2 get-pool-principal pool)))
    {
      sats: (min-of (get sats recorded) (get sats value)),
      ustx: (min-of (get ustx recorded) (get ustx value)),
    }
  )
)

(define-private (has-principal-id (pool principal))
  (let ((recorded (contract-call? .bxl-vault-v2 get-pool-principal pool)))
    (> (+ (get sats recorded) (get ustx recorded)) u0)
  )
)

;; A random amount from 1 to `limit` (0 when `limit` is 0).
(define-private (up-to
    (n uint)
    (limit uint)
  )
  (if (is-eq limit u0)
    u0
    (+ u1 (mod n limit))
  )
)

;; Maps a random uint onto an issued request id, so request invariants look
;; at requests that exist (or did).
(define-private (pick-request-id (n uint))
  (let ((last (contract-call? .bxl-vault-v2 get-last-request-id)))
    (if (is-eq last u0)
      u0
      (+ u1 (mod n last))
    )
  )
)

(define-private (min-of
    (a uint)
    (b uint)
  )
  (if (< a b)
    a
    b
  )
)

(define-private (get-deployed-into (pool principal))
  (default-to {
    sats: u0,
    ustx: u0,
  }
    (map-get? deployed-into pool)
  )
)

(define-private (get-deposited-sats (user principal))
  (default-to u0 (map-get? deposited-sats user))
)

(define-private (get-paid-sats (user principal))
  (default-to u0 (map-get? paid-sats user))
)

(define-private (get-deposited-ustx (user principal))
  (default-to u0 (map-get? deposited-ustx user))
)

(define-private (get-withdrawn-ustx (user principal))
  (default-to u0 (map-get? withdrawn-ustx user))
)

(define-private (get-vault-sbtc)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    get-balance .bxl-vault-v2
  ))
)

(define-private (get-bxl-btc (user principal))
  (unwrap-panic (contract-call? .bxl-btc-v2 get-balance user))
)

(define-private (get-transit (user principal))
  (unwrap-panic (contract-call? .bxl-btc-v2 get-transit-balance user))
)

(define-private (get-bxl-stx (user principal))
  (unwrap-panic (contract-call? .bxl-stx-v2 get-balance user))
)

(define-private (get-bxl-btc-supply)
  (unwrap-panic (contract-call? .bxl-btc-v2 get-total-supply))
)

(define-private (get-bxl-btc-transit-supply)
  (unwrap-panic (contract-call? .bxl-btc-v2 get-transit-supply))
)

(define-private (get-bxl-stx-supply)
  (unwrap-panic (contract-call? .bxl-stx-v2 get-total-supply))
)
