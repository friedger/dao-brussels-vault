;; `sbtc-pool-trait` adapter that is itself a pox-5 bond staker, for
;; `bxl-vault-v2` only.
;;
;; The vault's sBTC joins pox-5 bonds through this contract, which holds the
;; bond seat (the allowlisted principal) and the STX leg. It stakes with Fast
;; Pool's max500 signer manager. There are no other members: the vault deposits
;; and the vault's admins decide when to register, leave and withdraw.
;;
;; A separate contract because pox-5 keeps one position per principal: the
;; vault itself keeps staking its free STX with `stake`.
;;
;; Principal is tracked in `idle-sats` (here, not in pox-5) and read from
;; pox-5 (`get-staker-custodied-sbtc`, `stx-account`). Every other sBTC held
;; here is rewards: max500 pays them to this contract, whoever triggers the
;; claim, and `collect-rewards` passes them on to the vault.
;;
;; See docs/bxl-bond-staker-plan.md.
(impl-trait .sbtc-pool-trait.sbtc-pool-trait)
(use-trait signer-manager-trait 'SP000000000000000000002Q6VF78.pox-5.signer-manager-trait)

(define-constant ERR_UNAUTHORIZED (err u401))
(define-constant ERR_INVALID_AMOUNT (err u500))
(define-constant ERR_WRONG_SIGNER_MANAGER (err u507))

(define-constant VAULT .bxl-vault-v2)
(define-constant SIGNER_MANAGER 'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager)

;; sBTC principal held here: deposited and not yet registered, or returned by
;; `unstake-sbtc` and not yet handed back to the vault.
(define-data-var idle-sats uint u0)

;;; Vault

;; The vault has already sent `sats` sBTC and `ustx` STX here.
(define-public (deposit
    (sats uint)
    (ustx uint)
  )
  (begin
    (asserts! (is-eq contract-caller VAULT) ERR_UNAUTHORIZED)
    (var-set idle-sats (+ (var-get idle-sats) sats))
    (ok true)
  )
)

;; Admin: hands all idle sBTC and all unlocked STX back to the vault. sBTC in
;; a bond stays there: `unstake-sbtc` first. `sats` is ignored.
(define-public (withdraw (sats uint))
  (let (
      (idle (var-get idle-sats))
      (account (stx-account current-contract))
      (unlocked (get unlocked account))
    )
    (asserts! (is-vault-admin) ERR_UNAUTHORIZED)
    (var-set idle-sats u0)
    ;; The vault pulls both and checks its balance; the allowances cap what it
    ;; can take at exactly what is reported.
    (try! (as-contract? (
        (with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token"
        idle
      )
        (with-stx unlocked)
      )
      (try! (contract-call? .bxl-vault-v2 pool-withdrawn idle unlocked
        (get-custodied-sats) (get locked account)
      ))
    ))
    (ok idle)
  )
)

;; Everything above the idle principal is rewards.
(define-public (collect-rewards)
  (let ((rewards (get-rewards)))
    (asserts! (is-eq contract-caller VAULT) ERR_UNAUTHORIZED)
    (if (> rewards u0)
      (try! (as-contract?
        ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          "sbtc-token" rewards
        ))
        (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          transfer rewards tx-sender VAULT none
        ))
      ))
      true
    )
    (ok rewards)
  )
)

;;; Admin: the bond seat

;; Join `bond-index` with all sBTC (in a bond already and idle) and all STX
;; held here. Also rolls an ending bond into the next one: pox-5 moves only the
;; difference. No signer calldata, so max500 pays rewards here in sBTC.
(define-public (register
    (manager <signer-manager-trait>)
    (bond-index uint)
  )
  (let (
      (idle (var-get idle-sats))
      (sats (+ (get-custodied-sats) idle))
      (account (stx-account current-contract))
      (ustx (+ (get locked account) (get unlocked account)))
    )
    (asserts! (is-vault-admin) ERR_UNAUTHORIZED)
    (asserts! (is-eq (contract-of manager) SIGNER_MANAGER) ERR_WRONG_SIGNER_MANAGER)
    (asserts! (> sats u0) ERR_INVALID_AMOUNT)
    (var-set idle-sats u0)
    ;; pox-5 locks the whole STX leg, not just what is new, so the staking
    ;; allowance covers all of it.
    (as-contract? (
        (with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token"
        idle
      )
        (with-staking ustx)
      )
      (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5 register-for-bond
        bond-index manager ustx (err sats) none
      ))
    )
  )
)

;; Take `sats` out of the bond, early or after it ended. The sBTC comes back
;; here as idle principal; `withdraw` hands it to the vault. The STX leg stays
;; locked until the bond's unlock height.
(define-public (unstake-sbtc
    (manager <signer-manager-trait>)
    (sats uint)
  )
  (begin
    (asserts! (is-vault-admin) ERR_UNAUTHORIZED)
    (asserts! (is-eq (contract-of manager) SIGNER_MANAGER) ERR_WRONG_SIGNER_MANAGER)
    (asserts! (> sats u0) ERR_INVALID_AMOUNT)
    (var-set idle-sats (+ (var-get idle-sats) sats))
    ;; Releasing sBTC from a bond needs `with-pox` (it fails with u128
    ;; without); joining one in `register` needs only the asset allowances.
    (as-contract? ((with-pox))
      (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5 unstake-sbtc manager
        sats
      ))
    )
  )
)

;; Anyone: claim this seat's rewards for a reward cycle from max500 (anyone
;; may also call max500 directly). They stay here until `collect-rewards`.
(define-public (claim
    (reward-cycle uint)
    (bond-index (optional uint))
  )
  (contract-call?
    'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager
    claim-staker-rewards current-contract reward-cycle bond-index
  )
)

;;; Read-only

;; The principal: sBTC in pox-5 plus idle sBTC, and the whole STX leg. No exit
;; fee: `unstake-sbtc` returns all custodied sBTC.
(define-read-only (get-value)
  (let ((account (stx-account current-contract)))
    (ok {
      sats: (+ (get-custodied-sats) (var-get idle-sats)),
      ustx: (+ (get locked account) (get unlocked account)),
    })
  )
)

(define-read-only (get-idle-sats)
  (var-get idle-sats)
)

(define-read-only (get-custodied-sats)
  (contract-call? 'SP000000000000000000002Q6VF78.pox-5 get-staker-custodied-sbtc
    current-contract
  )
)

;; sBTC held here that is not principal.
(define-read-only (get-rewards)
  (- (get-sbtc-balance) (var-get idle-sats))
)

(define-read-only (get-membership)
  (contract-call? 'SP000000000000000000002Q6VF78.pox-5 get-bond-membership
    current-contract
  )
)

;;; Private

(define-private (is-vault-admin)
  (contract-call? .bxl-vault-v2 is-admin tx-sender)
)

(define-private (get-sbtc-balance)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    get-balance current-contract
  ))
)
