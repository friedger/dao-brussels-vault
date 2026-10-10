;; An sBTC staking pool, as seen by `bxl-vault-v2`.
;;
;; Each pool the vault can use (StackingDAO stBTC, the Xverse bond pool, the
;; Esbee bond pool) has its own interface. A small adapter per pool implements
;; this trait, holds the pool position in its own name and talks only to the
;; vault. Switching pools is then an admin call on the vault, not a migration.
(define-trait sbtc-pool-trait (
  (deposit
    (uint uint)
    (response bool uint)
  )
  (withdraw
    (uint)
    (response uint uint)
  )
  (collect-rewards
    ()
    (response uint uint)
  )
))
