;; `sbtc-pool-trait` adapter for the Esbee sBTC bond pool
;; (fastpool/sbtc-pool-bond-staker, v2).
;;
;; This contract is the pool member for `bxl-vault-v2`. A bond needs sBTC and
;; an STX leg: the vault sends both, the pool takes the sBTC plus
;; `get-required-ustx`, and any STX above that is added with `deposit-stx` to
;; carry the position into bonds that price sats higher in STX.
;;
;; Rollover is passive: the position rides into every bond the pool binds
;; until the admin calls `request-exit`. Released principal comes back to the
;; vault through `withdraw`.
;;
;; `.bond-staker` is the local copy of the pool for simnet. Replace it with the
;; mainnet principal once the v2 pool is deployed.
(impl-trait .sbtc-pool-trait.sbtc-pool-trait)
(use-trait signer-manager-trait 'SP000000000000000000002Q6VF78.pox-5.signer-manager-trait)

(define-constant err-unauthorized (err u401))
(define-constant err-invalid-amount (err u500))

(define-constant VAULT .bxl-vault-v2)

(define-public (deposit
    (sats uint)
    (ustx uint)
  )
  (let (
      (required (contract-call? .bond-staker get-required-ustx sats))
      (extra (if (> ustx required)
        (- ustx required)
        u0
      ))
    )
    (asserts! (is-eq contract-caller VAULT) err-unauthorized)
    (asserts! (>= ustx required) err-invalid-amount)
    (try! (as-contract?
      (
        (with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token"
        sats
      )
        (with-stx ustx)
      )
      (if (> sats u0)
        (begin
          (try! (contract-call? .bond-staker deposit sats))
          true
        )
        true
      )
      (if (> extra u0)
        (begin
          (try! (contract-call? .bond-staker deposit-stx extra))
          true
        )
        true
      )))
    (ok true)
  )
)

;; Takes back the queued deposit and any released principal, then sends all
;; sBTC and STX held here to the vault. Committed sats stay in the bond:
;; `request-exit` or `unstake-sbtc-early` first.
(define-public (withdraw (sats uint))
  (begin
    (asserts! (is-vault-admin) err-unauthorized)
    ;; Either may have nothing to return; that is not an error here.
    ;; `try!` inside `as-contract?` would leave this function, so the inner
    ;; result is only inspected.
    ;; The pool burns this contract's receipt tokens (`iou-bond-btc`,
    ;; `iou-bond-stx`) for what it pays out, so the burns need allowances.
    (is-ok (as-contract?
      (
        (with-ft .iou-bond-btc "bond-btc" (get-receipt-btc))
        (with-ft .iou-bond-stx "bond-stx" (get-receipt-stx))
      )
      (is-ok (contract-call? .bond-staker withdraw))
    ))
    (match (contract-call? .bond-staker claim-principal current-contract)
      released true
      e false
    )
    (send-all-to-vault)
  )
)

(define-public (collect-rewards)
  (begin
    (asserts! (is-eq contract-caller VAULT) err-unauthorized)
    (match (contract-call? .bond-staker sync-rewards)
      synced true
      e false
    )
    (match (contract-call? .bond-staker claim-rewards current-contract)
      amount (send-sbtc-to-vault amount)
      e (ok u0)
    )
  )
)

;; admin: pool actions that move nothing to the vault

(define-public (request-exit)
  (begin
    (asserts! (is-vault-admin) err-unauthorized)
    (as-contract? () (try! (contract-call? .bond-staker request-exit)))
  )
)

(define-public (cancel-exit)
  (begin
    (asserts! (is-vault-admin) err-unauthorized)
    (as-contract? () (try! (contract-call? .bond-staker cancel-exit)))
  )
)

;; Leave the bond before term with `sats`. The sats come back as released
;; principal, which the next `withdraw` picks up.
(define-public (unstake-sbtc-early
    (manager <signer-manager-trait>)
    (sats uint)
  )
  (begin
    (asserts! (is-vault-admin) err-unauthorized)
    (as-contract? ()
      (try! (contract-call? .bond-staker unstake-sbtc-early manager sats))
    )
  )
)

;; read-only functions

(define-read-only (get-position)
  (contract-call? .bond-staker get-member current-contract)
)

(define-read-only (get-claimable-rewards)
  (contract-call? .bond-staker get-claimable-rewards current-contract)
)

;; private functions

(define-private (is-vault-admin)
  (contract-call? .bxl-vault-v2 is-admin tx-sender)
)

(define-private (send-sbtc-to-vault (sats uint))
  (begin
    (if (> sats u0)
      (try! (as-contract?
        ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          "sbtc-token" sats
        ))
        (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          transfer sats tx-sender VAULT none
        ))
      ))
      true
    )
    (ok sats)
  )
)

(define-private (send-all-to-vault)
  (let (
      (sats (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        get-balance current-contract
      )))
      (ustx (stx-get-balance current-contract))
      (position (get-pool-position))
    )
    ;; The vault pulls both and checks its balance; the allowances cap what it
    ;; can take at exactly what is reported.
    (try! (as-contract?
      (
        (with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" sats)
        (with-stx ustx)
      )
      (try! (contract-call? .bxl-vault-v2 pool-withdrawn sats ustx
        (get sats position) (get ustx position)
      ))
    ))
    (ok sats)
  )
)

;; Receipt tokens the pool minted to this contract.
(define-private (get-receipt-btc)
  (unwrap-panic (contract-call? .iou-bond-btc get-balance current-contract))
)

(define-private (get-receipt-stx)
  (unwrap-panic (contract-call? .iou-bond-stx get-balance current-contract))
)

;; Principal the pool still holds for this contract, from the pool's own
;; books: bonded, queued and released but not yet paid out. Anyone may pay
;; rewards or released principal to this contract; that cannot change these.
(define-private (get-pool-position)
  (match (contract-call? .bond-staker get-settled-member current-contract)
    member {
      sats: (+ (get bonded-sats member) (get queued-sats member)
        (get released-sats member)
      ),
      ustx: (+ (get bonded-ustx member) (get queued-ustx member)
        (get released-ustx member)
      ),
    }
    {
      sats: u0,
      ustx: u0,
    }
  )
)
