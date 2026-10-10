;; Test double for `sbtc-pool-trait`: keeps what the vault sends and pays
;; rewards that a test adds with `add-rewards`.
(impl-trait .sbtc-pool-trait.sbtc-pool-trait)

(define-constant err-unauthorized (err u401))

(define-constant VAULT .bxl-vault-v2)

(define-data-var rewards uint u0)

;; Misbehaviour for the vault's balance checks: u1 = `deposit` sends 1 sat
;; back to the vault, u2 = `collect-rewards` reports 1 sat more than it sends.
(define-data-var cheat uint u0)

(define-public (set-cheat (mode uint))
  (ok (var-set cheat mode))
)

(define-public (deposit
    (sats uint)
    (ustx uint)
  )
  (begin
    (asserts! (is-eq contract-caller VAULT) err-unauthorized)
    (if (is-eq (var-get cheat) u1)
      (try! (send-to-vault u1 u0))
      true
    )
    (ok true)
  )
)

;; Returns up to `sats` sBTC and all STX. Rewards are not paid out here.
(define-public (withdraw (sats uint))
  (let (
      (held (- (get-sbtc-balance) (var-get rewards)))
      (amount (if (< sats held)
        sats
        held
      ))
      (ustx (stx-get-balance current-contract))
    )
    (asserts! (contract-call? .bxl-vault-v2 is-admin tx-sender) err-unauthorized)
    (try! (as-contract?
      (
        (with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" amount)
        (with-stx ustx)
      )
      (try! (contract-call? .bxl-vault-v2 pool-withdrawn amount ustx
        (- held amount) u0
      ))
    ))
    (ok amount)
  )
)

(define-public (collect-rewards)
  (let ((amount (var-get rewards)))
    (asserts! (is-eq contract-caller VAULT) err-unauthorized)
    (var-set rewards u0)
    (try! (send-to-vault amount u0))
    (ok (if (is-eq (var-get cheat) u2)
      (+ amount u1)
      amount
    ))
  )
)

;; Any amount the pool gained; `gain` sats count as principal growth (like
;; stBTC), `reward` sats are paid through `collect-rewards`.
(define-public (add-sbtc
    (gain uint)
    (reward uint)
  )
  (begin
    (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
      transfer (+ gain reward) tx-sender current-contract none
    ))
    (var-set rewards (+ (var-get rewards) reward))
    (ok true)
  )
)

(define-private (get-sbtc-balance)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    get-balance current-contract
  ))
)

(define-private (send-to-vault
    (sats uint)
    (ustx uint)
  )
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
    (if (> ustx u0)
      (try! (as-contract? ((with-stx ustx)) (try! (stx-transfer? ustx tx-sender VAULT))))
      true
    )
    (ok true)
  )
)
