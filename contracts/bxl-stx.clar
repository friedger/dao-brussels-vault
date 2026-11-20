(define-constant ERR_UNAUTHORIZED (err u401))
(define-constant ERR_FORBIDDEN (err u403))

(define-fungible-token bxl-stx)

(define-constant DEPLOYER tx-sender)

(define-data-var vault (optional principal) none)

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (begin
    (if false
      (ok true)
      ERR_FORBIDDEN
    )
  )
)

(define-read-only (get-name)
  (ok "Dao Brussels Stacks")
)

(define-read-only (get-symbol)
  (ok "bxlSTX")
)

(define-read-only (get-decimals)
  (ok u6)
)

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance bxl-stx who))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply bxl-stx))
)

(define-read-only (get-token-uri)
  (ok none)
)

(define-public (mint (amount uint))
  (begin
    (asserts! (is-vault-calling) ERR_UNAUTHORIZED)
    (try! (ft-mint? bxl-stx amount tx-sender))
    (ok true)
  )
)

(define-public (burn (amount uint))
  (begin
    (asserts! (is-vault-calling) ERR_UNAUTHORIZED)
    (try! (ft-burn? bxl-stx amount tx-sender))
    (ok true)
  )
)

(define-private (is-vault-calling)
  (is-eq contract-caller (unwrap! (var-get vault) false))
)

;; can be called only once, by the deployer
(define-public (set-vault (blx-vault principal))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR_UNAUTHORIZED)
    (asserts! (is-none (var-get vault)) ERR_FORBIDDEN)
    (var-set vault (some blx-vault))
    (ok true)
  )
)
