(define-public (test-enroll)
  (begin
    ;; Deposit 1000 sSats
    (try! (contract-call? .bxl-vault deposit u10000))

    ;; Enroll the vault
    (try! (contract-call? .bxl-vault enroll))
    (ok true)
  )
)