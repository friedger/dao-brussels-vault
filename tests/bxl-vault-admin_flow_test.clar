;; @name admin can not use principal
;; @format-ignore
(define-public (test-withdraw-admin-fails)
  (begin
    ;; Deposit 1000 sSats
    ;; @caller wallet_1
    (unwrap! (contract-call? .bxl-vault deposit u1000) (err u999))

    ;; Admin can't transfers any sSats since no yield yet
    ;; @caller deployer
    (try! (withdraw-admin-fails))

    (ok true)
  )
)

;; @name admin can use yield
(define-public (test-withdraw-admin)
  (begin
    ;; Deposit 1000 sSats
    ;; @caller wallet_1
    (unwrap! (contract-call? .bxl-vault deposit u1000) (err u999))

    ;; @caller wallet_2
    (try! (send-yield))

    ;; @caller deployer
    (try! (withdraw-admin))

    (ok true)
  )
)

(define-public (withdraw-admin-fails)
  (match (contract-call? .bxl-vault admin-sbtc-transfer u1
    'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG
  )
    success (err u999)
    error (begin
      (asserts! (is-eq error u500) (err u998))
      (ok true)
    )
  )
)

(define-public (send-yield)
  (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer
    u10 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG .bxl-vault none
  )
)

(define-public (withdraw-admin)
  (contract-call? .bxl-vault admin-sbtc-transfer u10
    'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG
  )
)
