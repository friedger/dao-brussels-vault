(define-constant contract-owner tx-sender)

(define-constant err-not-allowed (err u403))
(define-constant err-too-much (err u500))

(define-fungible-token bxl-btc)
(define-fungible-token bxl-btc-locked)

(define-data-var vault (optional principal) none)

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (begin
    (asserts! (or (is-eq tx-sender sender) (is-eq contract-caller sender))
      err-not-allowed
    )
    (try! (ft-transfer? bxl-btc amount sender recipient))

    (match memo
      to-print (print to-print)
      0x
    )
    (ok true)
  )
)

(define-read-only (get-name)
  (ok "Dao Brussels Bitcoin")
)

(define-read-only (get-symbol)
  (ok "bxlBTC")
)

(define-read-only (get-decimals)
  (ok u8)
)

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance bxl-btc who))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply bxl-btc))
)

(define-read-only (get-token-uri)
  (ok none)
)

(define-public (mint (amount uint))
  (begin
    (asserts! (is-vault-calling) err-not-allowed)
    (try! (ft-mint? bxl-btc amount tx-sender))
    (ok true)
  )
)

(define-public (lock (amount uint))
  (begin
    (asserts! (is-vault-calling) err-not-allowed)
    (try! (ft-burn? bxl-btc amount tx-sender))
    (try! (ft-mint? bxl-btc-locked amount current-contract))
    (try! (ft-transfer? bxl-btc-locked amount current-contract tx-sender))
    (ok true)
  )
)

(define-public (burn
    (amount uint)
    (user principal)
  )
  (begin
    (asserts! (is-vault-calling) err-not-allowed)
    (try! (ft-burn? bxl-btc-locked amount user))
    (ok true)
  )
)

(define-private (is-vault-calling)
  (is-eq contract-caller (unwrap! (var-get vault) false))
)

;; can be called only once
(define-public (set-vault (blx-vault principal))
  (begin
    (asserts! (is-none (var-get vault)) err-not-allowed)
    (var-set vault (some blx-vault))
    (ok true)
  )
)
