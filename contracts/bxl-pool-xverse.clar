;; `sbtc-pool-trait` adapter for the Xverse sBTC bond pool, lane 3
;; (SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3, which binds
;; bonds 3, 9, 15, ...).
;;
;; This contract is the pool member for `bxl-vault-v2`. The vault sends sBTC
;; and the STX leg; the pool takes what it needs and the rest waits here for
;; the next `withdraw`.
;;
;; Rollover is explicit: before each new bond the admin must call
;; `commit-rollover`, or the pool releases the whole position at the roll.
;; Before epoch 0 a deposit queues for the first bond; afterwards it joins the
;; next bond through `commit-rollover` with the added sats.
(impl-trait .sbtc-pool-trait.sbtc-pool-trait)
(use-trait signer-manager-trait 'SP000000000000000000002Q6VF78.pox-5.signer-manager-trait)

(define-constant err-unauthorized (err u401))
(define-constant err-invalid-amount (err u500))

(define-constant VAULT .bxl-vault-v2)

(define-public (deposit
    (sats uint)
    (ustx uint)
  )
  (begin
    (asserts! (is-eq contract-caller VAULT) err-unauthorized)
    ;; Zero sats: the STX waits here for `commit-rollover`.
    (try! (as-contract?
      (
        (with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token"
        sats
      )
        (with-stx ustx)
      )
      (if (is-eq sats u0)
        true
        (if (is-initial-epoch)
          (begin
            (try! (contract-call?
              'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
              deposit sats
            ))
            true
          )
          (begin
            (try! (contract-call?
              'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
              commit-rollover sats
            ))
            true
          )
        )
      )))
    (ok true)
  )
)

;; Takes back the queued deposit and any released principal, then sends all
;; sBTC and STX held here to the vault. Committed sats stay in the bond: skip
;; `commit-rollover`, or `request-exit` or `unstake-sbtc-early` first.
(define-public (withdraw (sats uint))
  (begin
    (asserts! (is-vault-admin) err-unauthorized)
    ;; Either may have nothing to return; that is not an error here. The
    ;; queued deposit can only be taken back before epoch 0.
    ;; `try!` inside `as-contract?` would leave this function, so the inner
    ;; result is only inspected.
    (is-ok (as-contract? ()
      (is-ok (contract-call?
        'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
        withdraw
      ))
    ))
    (match (contract-call?
      'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
      claim-principal current-contract
    )
      released true
      e false
    )
    (send-all-to-vault)
  )
)

(define-public (collect-rewards)
  (begin
    (asserts! (is-eq contract-caller VAULT) err-unauthorized)
    (match (contract-call?
      'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
      sync-rewards
    )
      synced true
      e false
    )
    (match (contract-call?
      'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
      claim-rewards current-contract
    )
      amount (send-sbtc-to-vault amount)
      e (ok u0)
    )
  )
)

;; admin: pool actions that move nothing to the vault

;; Carry the whole position into the next bond. Any STX the new bond needs on
;; top of the current leg comes from STX held here; the vault sends it with
;; `enroll` and zero sats.
(define-public (commit-rollover)
  (let ((ustx (stx-get-balance current-contract)))
    (asserts! (is-vault-admin) err-unauthorized)
    (as-contract? ((with-stx ustx))
      (try! (contract-call?
        'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
        commit-rollover u0
      ))
    )
  )
)

(define-public (cancel-rollover-commitment)
  (begin
    (asserts! (is-vault-admin) err-unauthorized)
    (as-contract? ()
      (try! (contract-call?
        'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
        cancel-rollover-commitment
      ))
    )
  )
)

(define-public (request-exit)
  (begin
    (asserts! (is-vault-admin) err-unauthorized)
    (as-contract? ()
      (try! (contract-call?
        'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
        request-exit
      ))
    )
  )
)

(define-public (cancel-exit)
  (begin
    (asserts! (is-vault-admin) err-unauthorized)
    (as-contract? ()
      (try! (contract-call?
        'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
        cancel-exit
      ))
    )
  )
)

;; Leave the bond before term with `sats`. The sats come back as released
;; principal, which the next `withdraw` picks up.
(define-public (unstake-sbtc-early
    (manager <signer-manager-trait>)
    (sats uint)
  )
  (begin
    (asserts! (is-vault-admin) err-unauthorized)
    (as-contract? ()
      (try! (contract-call?
        'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
        unstake-sbtc-early manager sats
      ))
    )
  )
)

;; read-only functions

(define-read-only (get-position)
  (contract-call? 'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
    get-member current-contract
  )
)

(define-read-only (get-claimable-rewards)
  (contract-call? 'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
    get-claimable-rewards current-contract
  )
)

;; private functions

(define-private (is-initial-epoch)
  (is-eq
    (get epoch-count
      (contract-call?
        'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3
        get-config
      ))
    u0
  )
)

(define-private (is-vault-admin)
  (contract-call? .bxl-vault-v2 is-admin tx-sender)
)

(define-private (send-sbtc-to-vault (sats uint))
  (begin
    (if (> sats u0)
      (try! (as-contract?
        ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          "sbtc-token" sats
        ))
        (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          transfer sats tx-sender VAULT none
        ))
      ))
      true
    )
    (ok sats)
  )
)

(define-private (send-all-to-vault)
  (let (
      (sats (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        get-balance current-contract
      )))
      (ustx (stx-get-balance current-contract))
      (position (get-pool-position))
    )
    ;; The vault pulls both and checks its balance; the allowances cap what it
    ;; can take at exactly what is reported.
    (try! (as-contract?
      (
        (with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" sats)
        (with-stx ustx)
      )
      (try! (contract-call? .bxl-vault-v2 pool-withdrawn sats ustx
        (get sats position) (get ustx position)
      ))
    ))
    (ok sats)
  )
)

;; Principal the pool still holds for this contract, from the pool's own
;; books: bonded, queued and released but not yet paid out. Anyone may pay
;; rewards or released principal to this contract; that cannot change these.
(define-private (get-pool-position)
  (match (contract-call? 'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-3 get-settled-member current-contract)
    member {
      sats: (+ (get bonded-sats member) (get queued-sats member)
        (get released-sats member)
      ),
      ustx: (+ (get bonded-ustx member) (get queued-ustx member)
        (get released-ustx member)
      ),
    }
    {
      sats: u0,
      ustx: u0,
    }
  )
)
