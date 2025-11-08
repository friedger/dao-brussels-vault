(define-public (test-happy-path)
  (begin
    ;; Deposit 1000 sSats
    (try! (contract-call? .bxl-vault deposit u1000))
    ;; Withdraw 500 sSats
    (try! (contract-call? .bxl-vault withdraw u500))
    ;; Withdraw 500 sSats
    (try! (contract-call? .bxl-vault withdraw u500))
    ;; Deposit 2000 uSTX
    (try! (contract-call? .bxl-vault deposit-stx u2000))
    ;; Withdraw 1000 uSTX
    (try! (contract-call? .bxl-vault withdraw-stx u1000))
    ;; Withdraw 1000 uSTX
    (try! (contract-call? .bxl-vault withdraw-stx u1000))
    (ok true)
  )
)

(define-public (test-unhappy-path)
  (begin
    ;; Deposit 1000 sSats
    (try! (contract-call? .bxl-vault deposit u1000))
    ;; Withdraw 1001 sSats
    (try! (withdraw-fails u1001))
    ;; Deposit 2000 uSTX
    (try! (contract-call? .bxl-vault deposit-stx u2000))
    ;; Withdraw 2001 uSTX
    (try! (withdraw-stx-fails u2001))
    (ok true)
  )
)

(define-public (withdraw-fails (amount uint))
  (match (contract-call? .bxl-vault withdraw amount)
    success (err u999)
    error (begin (asserts! (is-eq error u1) (err u998))
          (ok true)
    ) 
  )
)

(define-public (withdraw-stx-fails (amount uint))
  (match (contract-call? .bxl-vault withdraw-stx amount)
    success (err u999)
    error (begin (asserts! (is-eq error u1) (err u998))
          (ok true)
    ) 
  )
)