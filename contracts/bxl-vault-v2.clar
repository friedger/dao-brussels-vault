;; BXL Vault v2: the v1 user mechanics on pox-5.
;;
;; Users deposit sBTC and STX and get bxl-btc and bxl-stx 1:1, exactly as in
;; v1. The admin puts the sBTC to work in one of the sBTC pools behind
;; `sbtc-pool-trait` (stBTC, Xverse, Esbee) and stakes the free STX with a
;; pox-5 signer manager. All rewards arrive in this contract as sBTC; anything
;; above what the vault owes its users is the yield.

(use-trait sbtc-pool-trait .sbtc-pool-trait.sbtc-pool-trait)
(use-trait signer-manager-trait 'SP000000000000000000002Q6VF78.pox-5.signer-manager-trait)

(define-constant err-unauthorized (err u401))
(define-constant err-forbidden (err u403))
(define-constant err-not-found (err u404))
(define-constant err-invalid-amount (err u500))
(define-constant err-no-balance (err u501))
(define-constant err-pool-not-approved (err u502))
(define-constant err-manager-not-approved (err u503))
;; The vault's balance did not move by what the adapter call says it moved.
(define-constant err-balance-mismatch (err u504))

(define-map admins
  principal
  bool
)
(map-set admins tx-sender true)

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
(define-data-var enrolled-sats uint u0)
(define-data-var enrolled-ustx uint u0)

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
    (asserts! (> amount u0) err-invalid-amount)
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
      err-forbidden
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
      (details (unwrap! (map-get? withdrawal-requests request-id) err-not-found))
      (user (get user details))
    )
    (asserts! (is-eq user tx-sender) err-unauthorized)
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
      (details (unwrap! (map-get? withdrawal-requests request-id) err-not-found))
      (amount (get amount details))
      (user (get user details))
    )
    (asserts!
      (or
        (is-admin-calling)
        (> burn-block-height (get opens-at details))
      )
      err-unauthorized
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

;; The surplus above what users are owed. Pool principal counts as held.
(define-public (admin-sbtc-transfer
    (amount uint)
    (recipient principal)
  )
  (let (
      (sbtc-balance (get-sbtc-balance))
      (bxl-btc-supply (unwrap! (contract-call? .bxl-btc-v2 get-total-supply) err-no-balance))
    )
    (asserts! (is-admin-calling) err-unauthorized)
    (asserts!
      (>= (+ sbtc-balance (var-get enrolled-sats)) (+ amount bxl-btc-supply))
      err-invalid-amount
    )
    (try! (send-sbtc-from-vault amount recipient))
    (ok true)
  )
)

;; Staked (locked) STX and the STX leg in pools count as held.
(define-public (admin-stx-transfer
    (amount uint)
    (recipient principal)
  )
  (let (
      (account (stx-account current-contract))
      (stx-balance (+ (get locked account) (get unlocked account)))
      (bxl-stx-supply (unwrap! (contract-call? .bxl-stx-v2 get-total-supply) err-no-balance))
    )
    (asserts! (is-admin-calling) err-unauthorized)
    (asserts!
      (>= (+ stx-balance (var-get enrolled-ustx)) (+ amount bxl-stx-supply))
      err-invalid-amount
    )
    (try! (send-stx-from-vault amount recipient))
    (ok true)
  )
)

(define-public (admin-set-admin
    (admin principal)
    (enable bool)
  )
  (begin
    (asserts! (is-admin-calling) err-unauthorized)
    (asserts! (not (is-eq admin tx-sender)) err-forbidden)
    (map-set admins admin enable)
    (ok true)
  )
)

(define-public (admin-set-pool
    (pool principal)
    (enable bool)
  )
  (begin
    (asserts! (is-admin-calling) err-unauthorized)
    (map-set approved-pools pool enable)
    (ok true)
  )
)

(define-public (admin-set-manager
    (manager principal)
    (enable bool)
  )
  (begin
    (asserts! (is-admin-calling) err-unauthorized)
    (map-set approved-managers manager enable)
    (ok true)
  )
)

;; sBTC pools

;; Move `sats` sBTC and `ustx` STX into `pool`. This is the one entry point for
;; all three pools; the adapter does the pool-specific part.
(define-public (enroll
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
    (asserts! (is-admin-calling) err-unauthorized)
    (asserts! (is-pool-approved pool-id) err-pool-not-approved)
    (asserts! (> (+ sats ustx) u0) err-invalid-amount)
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
      )
      (try! (contract-call? pool deposit sats ustx))
    ))
    ;; Exactly `sats` and `ustx` left the vault, nothing more and nothing back.
    (asserts!
      (and
        (is-eq (get-sbtc-balance) (- sbtc-before sats))
        (is-eq (stx-get-balance current-contract) (- stx-before ustx))
      )
      err-balance-mismatch
    )
    (map-set pool-principal pool-id {
      sats: (+ (get sats current) sats),
      ustx: (+ (get ustx current) ustx),
    })
    (var-set enrolled-sats (+ (var-get enrolled-sats) sats))
    (var-set enrolled-ustx (+ (var-get enrolled-ustx) ustx))
    (print {
      topic: "enroll",
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
;; Only a contract the vault has enrolled funds into has a record to lower.
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
    (asserts! (is-some (map-get? pool-principal pool-id)) err-not-found)
    (asserts! (is-eq tx-sender pool-id) err-unauthorized)
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
      err-balance-mismatch
    )
    (map-set pool-principal pool-id {
      sats: new-sats,
      ustx: new-ustx,
    })
    (var-set enrolled-sats
      (- (var-get enrolled-sats) (- (get sats current) new-sats))
    )
    (var-set enrolled-ustx
      (- (var-get enrolled-ustx) (- (get ustx current) new-ustx))
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
    (asserts! (is-pool-approved (contract-of pool)) err-pool-not-approved)
    (let ((amount (try! (contract-call? pool collect-rewards))))
      ;; The reported rewards arrived as sBTC, and no STX moved.
      (asserts!
        (and
          (is-eq (get-sbtc-balance) (+ sbtc-before amount))
          (is-eq (stx-get-balance current-contract) stx-before)
        )
        err-balance-mismatch
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
    (asserts! (is-admin-calling) err-unauthorized)
    (asserts! (is-manager-approved (contract-of manager))
      err-manager-not-approved
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
    (asserts! (is-admin-calling) err-unauthorized)
    (asserts! (is-manager-approved (contract-of manager))
      err-manager-not-approved
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
    (asserts! (is-admin-calling) err-unauthorized)
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
  } (map-get? pool-principal pool)
  )
)

(define-read-only (get-enrolled)
  {
    sats: (var-get enrolled-sats),
    ustx: (var-get enrolled-ustx),
  }
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
