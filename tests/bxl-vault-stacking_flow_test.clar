;; @name stacking flow test
(define-public (test-stacking)
  (begin
    ;; Deposit 1000 sSats
    ;; @caller wallet_1
    (unwrap! (contract-call? .bxl-vault deposit-stx u1000) (err u999))

    ;; @caller 'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4
    (unwrap! (contract-call? 'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.pox4-multi-pool-v1 set-pool-pox-address-active {version: 0x04, hashbytes: 0x0c7fc13d45ff9a51ec36c0dac3b9c3589175500f}) (err u998))

    ;; @caller deployer
    (unwrap! (contract-call? .bxl-vault delegate-stx) (err u997))

    (ok true)
  )
)
