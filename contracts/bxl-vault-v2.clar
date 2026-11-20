;; BXL Vault v2: the v1 user mechanics on pox-5.
;;
;; Users deposit sBTC and STX and get bxl-btc and bxl-stx 1:1, exactly as in
;; v1. The admin puts the sBTC to work in one of the sBTC pools behind
;; `sbtc-pool-trait` (stBTC, Xverse, Esbee) and stakes the free STX with a
;; pox-5 signer manager. All rewards arrive in this contract as sBTC; anything
;; above what the vault owes its users is the yield.

(use-trait sbtc-pool-trait .sbtc-pool-trait.sbtc-pool-trait)
(use-trait signer-manager-trait 'SP000000000000000000002Q6VF78.pox-5.signer-manager-trait)

(define-constant ERR_UNAUTHORIZED (err u401))
(define-constant ERR_FORBIDDEN (err u403))
(define-constant ERR_NOT_FOUND (err u404))
(define-constant ERR_INVALID_AMOUNT (err u500))
(define-constant ERR_NO_BALANCE (err u501))
(define-constant ERR_POOL_NOT_APPROVED (err u502))
(define-constant ERR_MANAGER_NOT_APPROVED (err u503))
;; The vault's balance did not move by what the adapter call says it moved.
(define-constant ERR_BALANCE_MISMATCH (err u504))
;; The pools passed to an admin transfer do not cover all deployed principal.
(define-constant ERR_POOLS_INCOMPLETE (err u505))
(define-constant ERR_DUPLICATE_POOL (err u506))

(define-map admins
  principal
  bool
)
(map-set admins tx-sender true)
;; Number of enabled admins; never drops below one.
(define-data-var admin-count uint u1)

;; sBTC pools and pox-5 signer managers the admin may use.
(define-map approved-pools
  principal
  bool
)
(define-map approved-managers
  principal
  bool
)

;; Principal the vault has put into each pool and not taken back yet. Rewards
;; are not counted here: they are paid to the vault as sBTC.
(define-map pool-principal
  principal
  {
    sats: uint,
    ustx: uint,
  }
)
(define-data-var deployed-sats uint u0)
(define-data-var deployed-ustx uint u0)

(define-data-var last-request-id uint u0)
(define-map withdrawal-requests
  uint
  {
    user: principal,
    amount: uint,
    opens-at: uint,
  }
)
(define-map withdrawal-requests-by-user
  principal
  uint
)

(define-public (deposit (amount uint))
  (begin
    (try! (send-sbtc-to-vault amount))
    (try! (contract-call? .bxl-btc-v2 mint amount))
    (ok true)
  )
)

(define-public (withdraw-request
    (amount uint)
    (delay uint)
  )
  (let ((request-id (+ (var-get last-request-id) u1)))
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (try! (contract-call? .bxl-btc-v2 lock amount))
    (map-set withdrawal-requests request-id {
      user: tx-sender,
      amount: amount,
      opens-at: (+ burn-block-height
        (if (< delay u1000)
          u1000
          delay
        )),
    })
    ;; ensure only one active request per user
    (asserts! (map-insert withdrawal-requests-by-user tx-sender request-id)
      ERR_FORBIDDEN
    )
    (var-set last-request-id request-id)
    (ok request-id)
  )
)

(define-public (withdraw-update
    (request-id uint)
    (amount uint)
    (delay uint)
  )
  (let (
      (details (unwrap! (map-get? withdrawal-requests request-id) ERR_NOT_FOUND))
      (user (get user details))
    )
    (asserts! (is-eq user tx-sender) ERR_UNAUTHORIZED)
    ;; unlock previous amount for tx-sender
    (try! (contract-call? .bxl-btc-v2 unlock (get amount details)))
    (if (is-eq amount u0)
      (begin
        (map-delete withdrawal-requests-by-user user)
        (map-delete withdrawal-requests request-id)
      )
      (begin
        ;; lock new amount for tx-sender
        (try! (contract-call? .bxl-btc-v2 lock amount))
        (map-set withdrawal-requests request-id {
          user: tx-sender,
          amount: amount,
          opens-at: (+ burn-block-height
            (if (< delay u1000)
              u1000
              delay
            )),
        })
      )
    )
    (ok request-id)
  )
)

(define-public (withdraw-finalize (request-id uint))
  (let (
      (details (unwrap! (map-get? withdrawal-requests request-id) ERR_NOT_FOUND))
      (amount (get amount details))
      (user (get user details))
    )
    (asserts!
      (or (is-admin-calling) (> burn-block-height (get opens-at details)))
      ERR_UNAUTHORIZED
    )
    (try! (contract-call? .bxl-btc-v2 burn amount user))
    (try! (send-sbtc-from-vault amount user))
    ;; v1 kept the request, so an old, open id could pay out a later request's
    ;; locked tokens before that request's delay.
    (map-delete withdrawal-requests request-id)
    (map-delete withdrawal-requests-by-user user)
    (ok amount)
  )
)

(define-public (deposit-stx (amount uint))
  (begin
    (try! (send-stx-to-vault amount))
    (try! (contract-call? .bxl-stx-v2 mint amount))
    (ok true)
  )
)

(define-public (withdraw-stx (amount uint))
  (begin
    (try! (contract-call? .bxl-stx-v2 burn amount))
    (try! (send-stx-from-vault amount tx-sender))
    (ok true)
  )
)

;; The surplus above what users are owed. Users are owed bxl-btc and the
;; bxl-btc-transit of open withdrawal requests. `pools` must list every pool
;; holding deployed principal, once each; a pool counts at its recorded
;; principal, or at its current value if that is lower.
(define-public (admin-sbtc-transfer
    (amount uint)
    (recipient principal)
    (pools (list 10 <sbtc-pool-trait>))
  )
  (let (
      (sbtc-balance (get-sbtc-balance))
      (bxl-btc-supply (unwrap! (contract-call? .bxl-btc-v2 get-total-supply) ERR_NO_BALANCE))
      (bxl-btc-transit-supply (unwrap! (contract-call? .bxl-btc-v2 get-transit-supply) ERR_NO_BALANCE))
    )
    (asserts! (is-admin-calling) ERR_UNAUTHORIZED)
    (asserts!
      (>= (+ sbtc-balance (get sats (try! (get-pools-value pools))))
        (+ amount bxl-btc-supply bxl-btc-transit-supply)
      )
      ERR_INVALID_AMOUNT
    )
    (try! (send-sbtc-from-vault amount recipient))
    (ok true)
  )
)

;; Staked (locked) STX counts as held, the STX leg in pools as for
;; `admin-sbtc-transfer`.
(define-public (admin-stx-transfer
    (amount uint)
    (recipient principal)
    (pools (list 10 <sbtc-pool-trait>))
  )
  (let (
      (account (stx-account current-contract))
      (stx-balance (+ (get locked account) (get unlocked account)))
      (bxl-stx-supply (unwrap! (contract-call? .bxl-stx-v2 get-total-supply) ERR_NO_BALANCE))
    )
    (asserts! (is-admin-calling) ERR_UNAUTHORIZED)
    (asserts!
      (>= (+ stx-balance (get ustx (try! (get-pools-value pools))))
        (+ amount bxl-stx-supply)
      )
      ERR_INVALID_AMOUNT
    )
    (try! (send-stx-from-vault amount recipient))
    (ok true)
  )
)

;; Any admin may add or remove admins, including itself, as long as one
;; admin remains.
(define-public (admin-set-admin
    (admin principal)
    (enable bool)
  )
  (let (
      (was-admin (is-admin admin))
      (count (var-get admin-count))
      (new-count (if (is-eq was-admin enable)
        count
        (if enable
          (+ count u1)
          (- count u1)
        )
      ))
    )
    (asserts! (is-admin-calling) ERR_UNAUTHORIZED)
    (asserts! (> new-count u0) ERR_FORBIDDEN)
    (map-set admins admin enable)
    (var-set admin-count new-count)
    (ok true)
  )
)

(define-public (admin-set-pool
    (pool principal)
    (enable bool)
  )
  (begin
    (asserts! (is-admin-calling) ERR_UNAUTHORIZED)
    (map-set approved-pools pool enable)
    (ok true)
  )
)

(define-public (admin-set-manager
    (manager principal)
    (enable bool)
  )
  (begin
    (asserts! (is-admin-calling) ERR_UNAUTHORIZED)
    (map-set approved-managers manager enable)
    (ok true)
  )
)

;; sBTC pools

;; Move `sats` sBTC and `ustx` STX into `pool`. This is the one entry point for
;; all three pools; the adapter does the pool-specific part.
;;
;; It does not check that the vault still covers what users are owed: a pool
;; whose value is net of an exit fee (stBTC) lowers the coverage by that fee.
;; See docs/invariants.md, #7.
(define-public (deploy
    (pool <sbtc-pool-trait>)
    (sats uint)
    (ustx uint)
  )
  (let (
      (pool-id (contract-of pool))
      (current (get-pool-principal pool-id))
      (sbtc-before (get-sbtc-balance))
      (stx-before (stx-get-balance current-contract))
    )
    (asserts! (is-admin-calling) ERR_UNAUTHORIZED)
    (asserts! (is-pool-approved pool-id) ERR_POOL_NOT_APPROVED)
    (asserts! (> (+ sats ustx) u0) ERR_INVALID_AMOUNT)
    (try! (as-contract?
      (
        (with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token"
        sats
      )
        (with-stx ustx)
      )
      (if (> sats u0)
        (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          transfer sats tx-sender pool-id none
        ))
        true
      )
      (if (> ustx u0)
        (try! (stx-transfer? ustx tx-sender pool-id))
        true
      )))
    ;; Outside `as-contract?`: the adapter does not act as the vault.
    (try! (contract-call? pool deposit sats ustx))
    ;; Exactly `sats` and `ustx` left the vault, nothing more and nothing back.
    (asserts!
      (and
        (is-eq (get-sbtc-balance) (- sbtc-before sats))
        (is-eq (stx-get-balance current-contract) (- stx-before ustx))
      )
      ERR_BALANCE_MISMATCH
    )
    (map-set pool-principal pool-id {
      sats: (+ (get sats current) sats),
      ustx: (+ (get ustx current) ustx),
    })
    (var-set deployed-sats (+ (var-get deployed-sats) sats))
    (var-set deployed-ustx (+ (var-get deployed-ustx) ustx))
    (print {
      topic: "deploy",
      pool: pool-id,
      sats: sats,
      ustx: ustx,
    })
    (ok true)
  )
)

;; Called by a pool adapter when it hands funds back (the admin calls the
;; adapter's `withdraw` directly). The adapter calls from `as-contract?` with
;; allowances for `sats` and `ustx`, so it is also `tx-sender`, and the vault
;; pulls the funds itself and checks its balance before and after.
;;
;; `remaining-sats` and `remaining-ustx` are the position still in the pool,
;; read from the pool's own books, which third parties cannot change. The
;; recorded principal drops to that position, never rises, so:
;; - rewards someone pushed to the adapter count as yield, not principal,
;; - principal someone pushed to the adapter counts as principal,
;; - an exit fee (stBTC) is a loss, and stBTC growth is yield.
;; Only a contract the vault has deployed funds into has a record to lower.
(define-public (pool-withdrawn
    (sats uint)
    (ustx uint)
    (remaining-sats uint)
    (remaining-ustx uint)
  )
  (let (
      (pool-id contract-caller)
      (current (get-pool-principal pool-id))
      (new-sats (min-of remaining-sats (get sats current)))
      (new-ustx (min-of remaining-ustx (get ustx current)))
      (sbtc-before (get-sbtc-balance))
      (stx-before (stx-get-balance current-contract))
    )
    (asserts! (is-some (map-get? pool-principal pool-id)) ERR_NOT_FOUND)
    (asserts! (is-eq tx-sender pool-id) ERR_UNAUTHORIZED)
    (if (> sats u0)
      (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        transfer sats tx-sender current-contract none
      ))
      true
    )
    (if (> ustx u0)
      (try! (stx-transfer? ustx tx-sender current-contract))
      true
    )
    (asserts!
      (and
        (is-eq (get-sbtc-balance) (+ sbtc-before sats))
        (is-eq (stx-get-balance current-contract) (+ stx-before ustx))
      )
      ERR_BALANCE_MISMATCH
    )
    (map-set pool-principal pool-id {
      sats: new-sats,
      ustx: new-ustx,
    })
    (var-set deployed-sats
      (- (var-get deployed-sats) (- (get sats current) new-sats))
    )
    (var-set deployed-ustx
      (- (var-get deployed-ustx) (- (get ustx current) new-ustx))
    )
    (print {
      topic: "pool-withdrawn",
      pool: pool-id,
      sats: sats,
      ustx: ustx,
      remaining-sats: remaining-sats,
      remaining-ustx: remaining-ustx,
    })
    (ok true)
  )
)

;; Pull the pool's reward sBTC into the vault. Anyone may call it.
(define-public (collect-rewards (pool <sbtc-pool-trait>))
  (let (
      (sbtc-before (get-sbtc-balance))
      (stx-before (stx-get-balance current-contract))
    )
    (asserts! (is-pool-approved (contract-of pool)) ERR_POOL_NOT_APPROVED)
    (let ((amount (try! (contract-call? pool collect-rewards))))
      ;; The reported rewards arrived as sBTC, and no STX moved.
      (asserts!
        (and
          (is-eq (get-sbtc-balance) (+ sbtc-before amount))
          (is-eq (stx-get-balance current-contract) stx-before)
        )
        ERR_BALANCE_MISMATCH
      )
      (ok amount)
    )
  )
)

;; STX staking (pox-5)
;;
;; pox-5 has no delegation: the vault stakes its own STX through a signer
;; manager, and the manager pays the vault's share of the rewards in sBTC
;; (`claim-staker-rewards`, callable by anyone).

(define-public (stake
    (manager <signer-manager-trait>)
    (amount uint)
    (cycles uint)
  )
  (begin
    (asserts! (is-admin-calling) ERR_UNAUTHORIZED)
    (asserts! (is-manager-approved (contract-of manager))
      ERR_MANAGER_NOT_APPROVED
    )
    (as-contract? ((with-staking amount) (with-pox))
      (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5 stake manager amount
        cycles burn-block-height none
      ))
    )
  )
)

;; Lock more STX or extend the lock, optionally moving to another manager.
(define-public (stake-update
    (manager <signer-manager-trait>)
    (old-manager <signer-manager-trait>)
    (cycles-to-extend uint)
    (amount-increase uint)
  )
  (begin
    (asserts! (is-admin-calling) ERR_UNAUTHORIZED)
    (asserts! (is-manager-approved (contract-of manager))
      ERR_MANAGER_NOT_APPROVED
    )
    (as-contract? ((with-staking amount-increase) (with-pox))
      (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5 stake-update manager
        old-manager cycles-to-extend amount-increase none
      ))
    )
  )
)

;; Unlock the STX at the end of the current cycle.
(define-public (unstake (old-manager <signer-manager-trait>))
  (begin
    (asserts! (is-admin-calling) ERR_UNAUTHORIZED)
    (as-contract? ((with-pox))
      (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5 unstake old-manager))
    )
  )
)

;; read-only functions

(define-read-only (is-admin (who principal))
  (default-to false (map-get? admins who))
)

(define-read-only (is-pool-approved (pool principal))
  (default-to false (map-get? approved-pools pool))
)

(define-read-only (is-manager-approved (manager principal))
  (default-to false (map-get? approved-managers manager))
)

(define-read-only (get-pool-principal (pool principal))
  (default-to {
    sats: u0,
    ustx: u0,
  }
    (map-get? pool-principal pool)
  )
)

(define-read-only (get-deployed)
  {
    sats: (var-get deployed-sats),
    ustx: (var-get deployed-ustx),
  }
)

(define-read-only (get-admin-count)
  (var-get admin-count)
)

(define-read-only (get-last-request-id)
  (var-get last-request-id)
)

(define-read-only (get-withdrawal-request (request-id uint))
  (map-get? withdrawal-requests request-id)
)

;; The id of the user's open withdrawal request, if any.
(define-read-only (get-withdrawal-request-id (user principal))
  (map-get? withdrawal-requests-by-user user)
)

;; private functions

(define-private (is-admin-calling)
  (is-admin tx-sender)
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

;; What the deployed principal is worth now: each pool at its recorded
;; principal or its current value, whichever is lower, so a loss in a pool
;; counts before it is realised. `pools` must hold each pool once and together
;; cover all deployed principal.
(define-private (get-pools-value (pools (list 10 <sbtc-pool-trait>)))
  (let ((total (try! (fold add-pool-value pools
      (ok {
        seen: (list),
        principal-sats: u0,
        principal-ustx: u0,
        sats: u0,
        ustx: u0,
      })
    ))))
    (asserts!
      (and
        (is-eq (get principal-sats total) (var-get deployed-sats))
        (is-eq (get principal-ustx total) (var-get deployed-ustx))
      )
      ERR_POOLS_INCOMPLETE
    )
    (ok {
      sats: (get sats total),
      ustx: (get ustx total),
    })
  )
)

(define-private (add-pool-value
    (pool <sbtc-pool-trait>)
    (acc (response {
      seen: (list 10 principal),
      principal-sats: uint,
      principal-ustx: uint,
      sats: uint,
      ustx: uint,
    }
      uint
    ))
  )
  (let (
      (total (try! acc))
      (pool-id (contract-of pool))
      (principal (get-pool-principal pool-id))
      (value (try! (contract-call? pool get-value)))
    )
    (asserts! (is-none (index-of? (get seen total) pool-id)) ERR_DUPLICATE_POOL)
    (ok {
      seen: (unwrap! (as-max-len? (append (get seen total) pool-id) u10)
        ERR_DUPLICATE_POOL
      ),
      principal-sats: (+ (get principal-sats total) (get sats principal)),
      principal-ustx: (+ (get principal-ustx total) (get ustx principal)),
      sats: (+ (get sats total) (min-of (get sats principal) (get sats value))),
      ustx: (+ (get ustx total) (min-of (get ustx principal) (get ustx value))),
    })
  )
)

(define-private (get-sbtc-balance)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    get-balance current-contract
  ))
)

(define-private (send-sbtc-to-vault (amount uint))
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer
    amount tx-sender current-contract none
  )
)

(define-private (send-sbtc-from-vault
    (amount uint)
    (recipient principal)
  )
  (as-contract?
    ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token"
      amount
    ))
    (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
      transfer amount tx-sender recipient none
    ))
  )
)

(define-private (send-stx-to-vault (amount uint))
  (stx-transfer? amount tx-sender current-contract)
)

(define-private (send-stx-from-vault
    (amount uint)
    (recipient principal)
  )
  (as-contract? ((with-stx amount))
    (try! (stx-transfer? amount current-contract recipient))
  )
)

;; initialize the bxl-btc-v2 and bxl-stx-v2 contracts to point to this vault
(try! (contract-call? .bxl-btc-v2 set-vault current-contract))
(try! (contract-call? .bxl-stx-v2 set-vault current-contract))
