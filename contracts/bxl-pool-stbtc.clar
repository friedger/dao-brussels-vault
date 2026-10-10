;; `sbtc-pool-trait` adapter for StackingDAO stBTC.
;;
;; Holds stBTC for `bxl-vault-v2`. The stBTC/sBTC ratio grows with the pox-5
;; rewards StackingDAO earns, so there is nothing to collect: the yield is
;; realised when the vault withdraws more sats than it put in.
;;
;; Withdrawals: `withdraw` uses StackingDAO's idle reserve (instant, 1% fee
;; unless fee-exempt). For larger amounts the admin calls `init-withdraw`, then
;; `finish-withdraw` after the cooldown, and the next `withdraw`
;; forwards the sBTC. Until then the queued sBTC still counts as principal.
(impl-trait .sbtc-pool-trait.sbtc-pool-trait)

(define-constant err-unauthorized (err u401))
(define-constant err-invalid-amount (err u500))

(define-constant VAULT .bxl-vault-v2)
(define-constant ONE_8 u100000000)
(define-constant BPS u10000)

;; sBTC each queued StackingDAO withdrawal will pay out, after its fee.
(define-map queued-withdrawals
  uint
  uint
)
(define-data-var queued-sats uint u0)

(define-public (deposit
    (sats uint)
    (ustx uint)
  )
  (begin
    (asserts! (is-eq contract-caller VAULT) err-unauthorized)
    ;; stBTC has no STX leg.
    (asserts! (is-eq ustx u0) err-invalid-amount)
    (asserts! (> sats u0) err-invalid-amount)
    (try! (as-contract?
      ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token"
        sats
      ))
      (try! (contract-call?
        'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stacking-dao-core-stbtc-v1
        deposit sats u0
      ))
    ))
    (ok true)
  )
)

;; Admin: redeems stBTC worth `sats` from the idle reserve, then hands all sBTC
;; held here (including finished queued withdrawals) to the vault. Returns the
;; sBTC handed over.
(define-public (withdraw (sats uint))
  (let ((stbtc (min-of (sats-to-stbtc sats) (get-stbtc-balance))))
    (asserts! (is-vault-admin) err-unauthorized)
    (if (> stbtc u0)
      (try! (as-contract?
        ((with-ft 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stbtc-token "stbtc"
          stbtc
        ))
        (try! (contract-call?
          'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stacking-dao-core-stbtc-v1
          withdraw-idle stbtc
        ))
        true
      ))
      true
    )
    (hand-all-sbtc-to-vault)
  )
)

(define-public (collect-rewards)
  (begin
    (asserts! (is-eq contract-caller VAULT) err-unauthorized)
    (ok u0)
  )
)

;; admin: StackingDAO's queued withdrawal, without the idle fee

(define-public (init-withdraw (stbtc uint))
  (begin
    (asserts! (is-vault-admin) err-unauthorized)
    (let (
        (nft-id (try! (as-contract?
          ((with-ft 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stbtc-token "stbtc"
            stbtc
          ))
          (try! (contract-call?
            'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stacking-dao-core-stbtc-v1
            init-withdraw stbtc
          ))
        )))
        (entry (contract-call?
          'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.withdraw-data-stbtc
          get-withdrawals-by-nft nft-id
        ))
        (asset (get asset-amount entry))
        (payout (- asset (/ (* asset (get withdraw-fee entry)) BPS)))
      )
      (map-set queued-withdrawals nft-id payout)
      (var-set queued-sats (+ (var-get queued-sats) payout))
      (ok nft-id)
    )
  )
)

;; The sBTC stays here until the next `withdraw`.
(define-public (finish-withdraw (nft-id uint))
  (begin
    (asserts! (is-vault-admin) err-unauthorized)
    (var-set queued-sats
      (- (var-get queued-sats) (default-to u0 (map-get? queued-withdrawals nft-id)))
    )
    (map-delete queued-withdrawals nft-id)
    (as-contract?
      ((with-nft 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stbtc-withdraw-nft
        "withdraw-nft" (list nft-id)
      ))
      (try! (contract-call?
        'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stacking-dao-core-stbtc-v1
        withdraw nft-id
      ))
    )
  )
)

;; read-only functions

(define-read-only (get-stbtc-balance)
  (unwrap-panic (contract-call? 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stbtc-token
    get-balance current-contract
  ))
)

;; sBTC value of the position: stBTC at today's ratio (before withdrawal
;; fees), plus queued withdrawals, plus sBTC waiting here to be forwarded.
(define-read-only (get-sbtc-value)
  (+ (get-position) (get-sbtc-balance))
)

;; Principal still with StackingDAO: stBTC at today's ratio plus queued
;; withdrawals. Rewards are in the ratio; nothing is paid here.
(define-read-only (get-position)
  (+ (stbtc-to-sats (get-stbtc-balance)) (var-get queued-sats))
)

;; private functions

(define-private (is-vault-admin)
  (contract-call? .bxl-vault-v2 is-admin tx-sender)
)

(define-private (get-ratio)
  (contract-call? 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.data-stbtc-v1
    get-sbtc-per-stbtc
  )
)

(define-private (sats-to-stbtc (sats uint))
  (/ (+ (* sats ONE_8) (- (get-ratio) u1)) (get-ratio))
)

(define-private (stbtc-to-sats (stbtc uint))
  (/ (* stbtc (get-ratio)) ONE_8)
)

(define-private (get-sbtc-balance)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    get-balance current-contract
  ))
)

(define-private (hand-all-sbtc-to-vault)
  (let ((sats (get-sbtc-balance)))
    ;; The vault pulls the sBTC and checks its balance; the allowance caps
    ;; what it can take at exactly what is reported. The position left with
    ;; StackingDAO is what the vault keeps as principal.
    (try! (as-contract?
      ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" sats))
      (try! (contract-call? .bxl-vault-v2 pool-withdrawn sats u0 (get-position) u0))
    ))
    (ok sats)
  )
)

(define-private (min-of
    (a uint)
    (b uint)
  )
  (if (< a b)
    a
    b
  )
)
