(define-public (test-enroll)
  (begin
    ;; Deposit 1000 sSats
    (try! (contract-call? .bxl-vault deposit u10000))

    ;; Enroll the vault
    (try! (contract-call? .bxl-vault enroll))
    (ok true)
  )
)

(define-public (test-enroll-fails)
  (begin
    ;; Enroll the vault
    (match (contract-call? .bxl-vault enroll)
      success (err u999)
      error (begin
        (asserts! (is-eq error u104) (err error))
        (ok true)
      )
    )
  )
)
