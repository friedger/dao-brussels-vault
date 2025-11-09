(define-constant err-not-allowed (err u403))
(define-constant err-too-much (err u500))
(define-constant err-no-balance (err u501))

(define-map admins principal bool)
(map-set admins tx-sender true)

(define-public (deposit (amount uint))
  (begin
    (try! (send-sbtc-to-vault amount))
    (try! (contract-call? .bxl-btc mint amount))
    (ok true)
  )
)

(define-public (withdraw (amount uint))
  (begin
    (try! (contract-call? .bxl-btc burn amount))
    (try! (send-sbtc-from-vault amount tx-sender))
    (ok true)
  )
)

(define-public (deposit-stx (amount uint))
  (begin
    (try! (send-stx-to-vault amount))
    (try! (contract-call? .bxl-stx mint amount))
    (ok true)
  )
)

(define-public (withdraw-stx (amount uint))
  (begin
    (try! (contract-call? .bxl-stx burn amount))
    (try! (send-stx-from-vault amount tx-sender))
    (ok true)
  )
)

(define-public (admin-sbtc-transfer
    (amount uint)
    (recipient principal)
  )
  (let (
      (sbtc-balance (unwrap!
        (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          get-balance current-contract
        )
        err-no-balance
      ))
      (bxl-btc-supply (unwrap! (contract-call? .bxl-btc get-total-supply) err-no-balance))
    )
    (asserts! (is-admin-calling) err-not-allowed)
    (asserts! (>= sbtc-balance (+ amount bxl-btc-supply)) err-too-much)
    (try! (send-sbtc-from-vault amount recipient))
    (ok true)
  )
)

(define-public (admin-stx-transfer
    (amount uint)
    (recipient principal)
  )
  (let (
      (stx-balance (stx-get-balance current-contract))
      (bxl-stx-supply (unwrap! (contract-call? .bxl-stx get-total-supply) err-no-balance))
    )
    (asserts! (is-admin-calling) err-not-allowed)
    (asserts! (>= stx-balance (+ amount bxl-stx-supply)) err-too-much)
    (try! (send-stx-from-vault amount recipient))
    (ok true)
  )
)

(define-public (admin-set-admin (admin principal) (enable bool))
  (begin
    (asserts! (is-admin-calling) err-not-allowed)
    (var-set admin new-admin)
    (ok true)
  )
)

;; Dual Stacking

;; sbtc rewards go to this vault
(define-public (enroll)
  (as-contract? ()
    (try! (contract-call? 'SP1HFCRKEJ8BYW4D0E3FAWHFDX8A25PPAA83HWWZ9.dual-stacking-v1
      enroll none
    ))
  )
)

(define-public (delegate-stx)
  (begin
    (asserts! (is-admin-calling) err-not-allowed)
    (as-contract? ((with-stacking u1000000000000000))
      (try! (contract-call?
        'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.pox4-multi-pool-v1
        delegate-stx u1000000000000000
        (unwrap-panic (to-consensus-buff? {
          v: u1,
          c: "sbtc",
        }))
      ))
    )
  )
)

(define-public (revoke-delegate-stx)
  (begin
    (asserts! (is-admin-calling) err-not-allowed)
    (as-contract? ()
      (try! (match (contract-call? 'SP000000000000000000002Q6VF78.pox-4 revoke-delegate-stx)
        success (ok success)
        failure (err (to-uint failure))
      ))
    )
  )
)

;; private functions

(define-private (is-admin-calling)
  (default-to false (map-get? admins tx-sender))
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

;; initialize the bxl-btc and bxl-stx contracts to point to this vault
(try! (contract-call? .bxl-btc set-vault current-contract))
(try! (contract-call? .bxl-stx set-vault current-contract))

;; allow fast pool v2
(try! (as-contract? ()
  (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-4 allow-contract-caller
    'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.pox4-multi-pool-v1 none
  ))
))
