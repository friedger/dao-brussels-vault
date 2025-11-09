;; @name admin can change admins
;; @format-ignore
(define-public (test-withdraw-admin-fails)
  (begin
    ;; set wallet 2 as admin
    ;; @caller deployer
    (unwrap! (contract-call? .bxl-vault admin-set-admin 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG true) (err u999))

    ;; remove deployer 1 as admin
    ;; @caller wallet_2
    (unwrap! (contract-call? .bxl-vault admin-set-admin 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM false) (err u998))

    (ok true)
  )
)
