/**
 * CoBuy AI — Group-Buy Pool Creation Page (SUJ-02)
 *
 * Route: /group-buys/create
 *
 * Implements an authoritative form for independent retailers to publish a 72-hour
 * collective group-buy pool from an existing CONFIRMED purchasing requirement.
 *
 * Core Workflow:
 *  1. Requirement Selection: Filters strictly for status === 'CONFIRMED' (Rule BR-001).
 *  2. Supplier Offer Selection: Enforces backend Two-Stage AI Matching Engine
 *     (GET /api/requirements/:id/matches) as the authoritative compatibility gate.
 *     Strictly enforces explicit consent when requiresSubstitutionApproval is true.
 *  3. Initial Contribution: Integrates MOQStepCalculator to enforce Retailer MOQ (MOQ_R)
 *     and Step increments with live minor-unit financial calculations.
 *  4. Publishing & State-Preserving Recovery: Authoritative 72-hour lifecycle with
 *     two-phase submission handling to safely recover from partial contribution failures.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  AlertCircle,
  ArrowLeft,
  RotateCw,
  Info,
  Clock,
} from 'lucide-react';

import { formatMinorToMajor } from '@/utils/money';
import { calcRetailerMoq, calcStepMultiple } from '@/utils/moqMath';
import { MOQStepCalculator } from '@/components/common/MOQStepCalculator';
import { TierProgressBar } from '@/components/common/TierProgressBar';
import { ProvenanceBadge } from '@/components/common/ProvenanceBadge';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { cn } from '@/lib/utils';

import {
  fetchConfirmedRequirements,
  fetchRequirementMatches,
  searchSupplierOffers,
  createPool,
  joinPool,
} from '@/api/pools.api';

export function GroupBuyCreatePage() {
  const navigate = useNavigate();

  // ── Step 1: Requirements Data State ──
  const [requirements, setRequirements] = useState([]);
  const [selectedReqId, setSelectedReqId] = useState('');
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [reqsError, setReqsError] = useState(null);

  // ── Step 2: Compatible Supplier Offers State ──
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState(null);
  const [qualifiedOffers, setQualifiedOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [substitutionApproved, setSubstitutionApproved] = useState(false);

  // ── Step 3: Initial Contribution & Pool Configuration ──
  const [initialQuantity, setInitialQuantity] = useState(0);
  const [poolTitle, setPoolTitle] = useState('');

  // ── Step 4: Submission & State-Preserving Recovery ──
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [createdPool, setCreatedPool] = useState(null); // Preserved on partial failure
  const [contributionError, setContributionError] = useState(null);

  // Load eligible confirmed requirements on mount
  useEffect(() => {
    let ignore = false;
    async function executeLoadReqs() {
      try {
        const data = await fetchConfirmedRequirements();
        if (!ignore) {
          const confirmedOnly = (data || []).filter((r) => r && r.status === 'CONFIRMED');
          setRequirements(confirmedOnly);
          if (confirmedOnly.length > 0) {
            setSelectedReqId(confirmedOnly[0]._id);
          }
        }
      } catch (err) {
        if (!ignore) {
          setReqsError(err?.message || 'Failed to load procurement requirements.');
        }
      } finally {
        if (!ignore) {
          setLoadingReqs(false);
        }
      }
    }

    executeLoadReqs();
    return () => {
      ignore = true;
    };
  }, []);

  // Selected requirement record
  const selectedRequirement = useMemo(() => {
    return requirements.find((r) => r._id === selectedReqId) || null;
  }, [requirements, selectedReqId]);

  // When selected requirement changes, query the Two-Stage AI Matching Engine
  useEffect(() => {
    if (!selectedReqId) return;

    let isMounted = true;
    async function loadMatches() {
      await Promise.resolve();
      if (!isMounted) return;

      setOffersLoading(true);
      setOffersError(null);
      setSelectedOfferId('');
      setSubstitutionApproved(false);

      try {
        const [matchesResult, allOffers] = await Promise.all([
          fetchRequirementMatches(selectedReqId),
          searchSupplierOffers(),
        ]);

        if (!isMounted) return;

        const qualifiedMatches = matchesResult.qualifiedMatches || [];
        if (qualifiedMatches.length === 0) {
          setQualifiedOffers([]);
          setSelectedOfferId('');
          setOffersLoading(false);
          return;
        }

        const matchMetaMap = new Map();
        qualifiedMatches.forEach((m) => {
          if (m && m.offerId && m.isCompatible) {
            matchMetaMap.set(String(m.offerId), m);
          }
        });

        const filtered = allOffers
          .filter((offer) => matchMetaMap.has(String(offer._id)))
          .map((offer) => {
            const meta = matchMetaMap.get(String(offer._id));
            return {
              ...offer,
              matchingMeta: meta,
              requiresSubstitutionApproval: Boolean(meta.requiresSubstitutionApproval),
              detectedMismatches: meta.detectedMismatches || [],
              matchReasons: meta.matchReasons || [],
              confidenceScore: meta.confidenceScore || 1,
            };
          });

        setQualifiedOffers(filtered);
        if (filtered.length > 0) {
          setSelectedOfferId(filtered[0]._id);
        }
      } catch (err) {
        if (isMounted) {
          setOffersError(err?.message || 'Failed to evaluate compatible supplier offers.');
        }
      } finally {
        if (isMounted) {
          setOffersLoading(false);
        }
      }
    }

    loadMatches();

    return () => {
      isMounted = false;
    };
  }, [selectedReqId]);

  // Selected supplier offer record
  const selectedOffer = useMemo(() => {
    return qualifiedOffers.find((o) => o._id === selectedOfferId) || null;
  }, [qualifiedOffers, selectedOfferId]);

  // Sync title and initial quantity during render when selectedOffer changes (avoids set-state-in-effect)
  const [prevOfferId, setPrevOfferId] = useState('');
  if (selectedOffer && selectedRequirement && selectedOffer._id !== prevOfferId) {
    setPrevOfferId(selectedOffer._id);
    const prodName =
      selectedOffer.productId?.canonicalName ||
      selectedRequirement.confirmedFields?.productName ||
      selectedRequirement.productName ||
      'Wholesale Product';
    const area =
      selectedRequirement.confirmedFields?.deliveryArea ||
      selectedRequirement.deliveryArea ||
      'Regional';
    setPoolTitle(`${prodName} — ${area} Pool`);

    const calculatedMoqW = selectedOffer.minimumOrderQuantity || 100;
    const calculatedMoqR = calcRetailerMoq(calculatedMoqW, selectedOffer.retailerMoqPercentage || 20);
    setInitialQuantity(calculatedMoqR);
  }

  // Derived mathematical thresholds from SUJ-01 moqMath utilities
  const moqW = selectedOffer?.minimumOrderQuantity || 100;
  const pMin = selectedOffer?.retailerMoqPercentage || 20;
  const pStep = selectedOffer?.retailerStepPercentage || 1;
  const moqR = calcRetailerMoq(moqW, pMin);
  const step = calcStepMultiple(moqW, pStep);
  const packUnit = selectedOffer?.packUnit || 'UNIT';
  const currency = selectedOffer?.currency || 'INR';
  const basePriceMinor = selectedOffer?.baseUnitPriceMinor || 0;
  const quantityTiers = selectedOffer?.quantityTiers || [];

  // Check whether substitution approval is required for the currently selected offer
  const requiresConsent = Boolean(selectedOffer?.requiresSubstitutionApproval);
  const canPublish =
    Boolean(selectedRequirement) &&
    Boolean(selectedOffer) &&
    initialQuantity >= moqR &&
    (!requiresConsent || substitutionApproved) &&
    !submitting;

  // ── Form Submission Handler with State-Preserving Recovery ──
  const handlePublishPool = async (e) => {
    e.preventDefault();
    if (!canPublish) return;

    setSubmitting(true);
    setSubmitError(null);
    setContributionError(null);

    let activePool = createdPool;

    // Phase 1: Create Pool (Only if not already created in a previous attempt)
    if (!activePool) {
      try {
        const poolPayload = {
          title: poolTitle.trim(),
          productId: selectedOffer.productId?._id || selectedOffer.productId,
          supplierOfferId: selectedOffer._id,
          deliveryArea:
            selectedRequirement.confirmedFields?.deliveryArea ||
            selectedRequirement.deliveryArea ||
            'Central',
          currency,
          packUnit,
          minimumOrderQuantity: moqW,
          retailerMoqPercentage: pMin,
          retailerStepPercentage: pStep,
          baseUnitPriceMinor: basePriceMinor,
          shippingCostMinor: selectedOffer.flatShippingCostMinor || selectedOffer.shippingCostMinor || 0,
          paymentPolicy: 'PAY_AT_JOIN',
        };

        activePool = await createPool(poolPayload);
        setCreatedPool(activePool); // Preserve state on server creation
      } catch (err) {
        setSubmitError(err?.message || 'Failed to create group-buy pool. Please review input fields.');
        setSubmitting(false);
        return;
      }
    }

    // Phase 2: Register Creator's Initial Contribution
    try {
      await joinPool(activePool._id, {
        requirementId: selectedRequirement._id,
        quantity: initialQuantity,
        unit: packUnit,
        acceptSubstitution: substitutionApproved,
      });

      // Both succeeded: navigate cleanly to marketplace
      navigate('/group-buys');
    } catch (contribErr) {
      // Partial Failure Recovery: Pool exists on backend, but contribution failed
      setContributionError(
        contribErr?.message || 'Contribution registration failed. You may retry below.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Dedicated Retry Contribution Handler for Preserved Pool
  const handleRetryContribution = async () => {
    if (!createdPool) return;
    setSubmitting(true);
    setContributionError(null);
    try {
      await joinPool(createdPool._id, {
        requirementId: selectedRequirement?._id,
        quantity: initialQuantity,
        unit: packUnit,
        acceptSubstitution: substitutionApproved,
      });
      navigate('/group-buys');
    } catch (err) {
      setContributionError(err?.message || 'Contribution retry failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-16" data-testid="group-buy-create-page">
      {/* ── Top Header Bar ── */}
      <div className="flex items-center justify-between border-b border-midnight-border/60 pb-4">
        <div>
          <button
            type="button"
            onClick={() => navigate('/group-buys')}
            className="inline-flex items-center gap-1.5 text-xs text-midnight-muted hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Marketplace</span>
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-white font-space-grotesk">
            Publish 72h Group-Buy Pool
          </h1>
          <p className="text-xs text-midnight-muted mt-1">
            Aggregate regional kirana demand from your confirmed requirement to unlock wholesale MOQ pricing.
          </p>
        </div>


      </div>

      {/* ── Partial Pool Creation Recovery Alert ── */}
      {createdPool && contributionError && (
        <Alert variant="warning" className="space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">
                Pool Published, but Initial Contribution Incomplete
              </p>
              <p className="text-xs text-amber-200/90 mt-1">
                Your group-buy pool <strong>"{createdPool.title}"</strong> (ID: {createdPool._id}) has been created on the platform, but your initial committed quantity could not be registered automatically due to: <code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-300">{contributionError}</code>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="sm"
              loading={submitting}
              onClick={handleRetryContribution}
            >
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              <span>Retry Contribution to Pool</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/group-buys')}
            >
              Proceed to Marketplace
            </Button>
          </div>
        </Alert>
      )}

      {/* ── General Submit Error Alert ── */}
      {submitError && !createdPool && (
        <Alert variant="error" className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{submitError}</span>
        </Alert>
      )}

      <form onSubmit={handlePublishPool} className="space-y-8">
        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* STEP 1: Select Confirmed Requirement (Rule BR-001)                 */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section className="bg-midnight-card border border-midnight-border rounded-xl p-6 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-midnight-border/50 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-midnight-red/20 text-midnight-red text-xs font-bold font-mono">
                1
              </span>
              <h2 className="text-base font-bold text-white">
                Select Confirmed Requirement
              </h2>
            </div>
            <Badge variant="requirement" className="text-[10px]">
              Rule BR-001 Enforced
            </Badge>
          </div>

          {loadingReqs ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : reqsError ? (
            <Alert variant="error">{reqsError}</Alert>
          ) : requirements.length === 0 ? (
            <div className="rounded-lg border border-dashed border-midnight-border p-6 text-center space-y-2">
              <Info className="h-6 w-6 text-midnight-muted mx-auto" />
              <p className="text-sm font-semibold text-white">No Confirmed Requirements Found</p>
              <p className="text-xs text-midnight-muted max-w-sm mx-auto">
                Only purchasing requirements with status <strong>CONFIRMED</strong> can seed a group-buy pool. Please confirm a requirement first.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => navigate('/requirements')}
              >
                Go to Requirements Intake
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="requirement-select" className="block text-xs font-semibold uppercase tracking-wider text-midnight-muted mb-1.5">
                  Confirmed Purchase Requirement
                </label>
                <select
                  id="requirement-select"
                  value={selectedReqId}
                  disabled={Boolean(createdPool)}
                  onChange={(e) => setSelectedReqId(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-midnight-border bg-midnight-surface text-sm text-white focus:outline-none focus:ring-2 focus:ring-midnight-red transition-colors cursor-pointer"
                >
                  {requirements.map((req) => {
                    const name = req.confirmedFields?.productName || req.productName || 'Product';
                    const qty = req.confirmedFields?.requestedQuantity || req.requestedQuantity || 0;
                    const unit = req.confirmedFields?.quantityUnit || req.quantityUnit || 'units';
                    const area = req.confirmedFields?.deliveryArea || req.deliveryArea || 'Area';
                    return (
                      <option key={req._id} value={req._id}>
                        {name} — {qty} {unit} ({area})
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedRequirement && (
                <div className="bg-midnight-surface/50 border border-midnight-border/50 rounded-lg p-3 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-midnight-muted uppercase text-[10px] block">Product</span>
                    <strong className="text-white">
                      {selectedRequirement.confirmedFields?.productName || selectedRequirement.productName}
                    </strong>
                  </div>
                  <div>
                    <span className="text-midnight-muted uppercase text-[10px] block">Category</span>
                    <strong className="text-white">
                      {selectedRequirement.confirmedFields?.category || selectedRequirement.category || 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-midnight-muted uppercase text-[10px] block">Target Quantity</span>
                    <strong className="text-white font-mono">
                      {selectedRequirement.confirmedFields?.requestedQuantity || selectedRequirement.requestedQuantity}{' '}
                      {selectedRequirement.confirmedFields?.quantityUnit || selectedRequirement.quantityUnit}
                    </strong>
                  </div>
                  <div>
                    <span className="text-midnight-muted uppercase text-[10px] block">Delivery Area</span>
                    <strong className="text-teal-300">
                      {selectedRequirement.confirmedFields?.deliveryArea || selectedRequirement.deliveryArea}
                    </strong>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* STEP 2: Choose Compatible Wholesaler Offer (Authoritative AI Gate) */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section className="bg-midnight-card border border-midnight-border rounded-xl p-6 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-midnight-border/50 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-midnight-red/20 text-midnight-red text-xs font-bold font-mono">
                2
              </span>
              <h2 className="text-base font-bold text-white">
                Select Qualified Supplier Offer
              </h2>
            </div>
            <Badge variant="provenance" className="text-[10px]">
              AI Evaluated Matches Only
            </Badge>
          </div>

          {offersLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : offersError ? (
            <Alert variant="error">{offersError}</Alert>
          ) : qualifiedOffers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-midnight-border p-6 text-center space-y-2">
              <AlertCircle className="h-6 w-6 text-amber-400 mx-auto" />
              <p className="text-sm font-semibold text-white">No Compatible Supplier Offers Qualified</p>
              <p className="text-xs text-midnight-muted max-w-sm mx-auto">
                The backend matching engine evaluated candidate supplier offers for this delivery area and product specification, but none passed compatibility checks.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-midnight-muted">
                Authoritative Two-Stage Matching Engine qualified {qualifiedOffers.length} offer(s) based on delivery routing, expiry, and packaging unit compatibility:
              </p>

              <div className="grid grid-cols-1 gap-3">
                {qualifiedOffers.map((offer) => {
                  const isSelected = offer._id === selectedOfferId;
                  const supplierName =
                    offer.supplierId?.name || offer.matchingMeta?.supplierName || 'Verified Wholesaler';
                  const prodName =
                    offer.productId?.canonicalName || offer.matchingMeta?.productName || 'Catalogue Product';
                  const source = offer.dataSourceType || offer.supplierId?.dataSourceType || null;

                  return (
                    <div
                      key={offer._id}
                      onClick={() => !createdPool && setSelectedOfferId(offer._id)}
                      className={cn(
                        'rounded-lg border p-4 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3',
                        isSelected
                          ? 'border-midnight-red bg-midnight-red/5 ring-1 ring-midnight-red'
                          : 'border-midnight-border bg-midnight-surface/40 hover:border-slate-500'
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-white">{supplierName}</span>
                          {/* Provenance Badge strictly rendered when actual data source is verified */}
                          {source && <ProvenanceBadge type={source} className="text-[10px] py-0.5" />}
                          {offer.requiresSubstitutionApproval && (
                            <Badge variant="warning" className="text-[10px]">
                              Spec Substitution
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-midnight-muted">
                          Product: <strong className="text-slate-200">{prodName}</strong> ({offer.packUnit})
                        </p>

                        {offer.detectedMismatches?.length > 0 && (
                          <p className="text-[11px] text-amber-300">
                            Notes: {offer.detectedMismatches.join('; ')}
                          </p>
                        )}
                      </div>

                      <div className="text-left sm:text-right shrink-0">
                        <div className="font-mono font-bold text-sm text-teal-300">
                          {formatMinorToMajor(offer.baseUnitPriceMinor, offer.currency || 'INR')}
                          <span className="text-[10px] text-midnight-muted font-normal">/{offer.packUnit}</span>
                        </div>
                        <div className="text-[11px] text-midnight-muted font-mono">
                          MOQ_W: <strong className="text-white">{offer.minimumOrderQuantity}</strong> {offer.packUnit}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Explicit Substitution Approval Guard */}
              {selectedOffer?.requiresSubstitutionApproval && (
                <div className="bg-amber-950/20 border border-amber-900/40 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-200 space-y-1">
                      <p className="font-semibold text-white">Specification Substitution Approval Required</p>
                      <p>
                        The matching engine detected minor differences from your requirement:
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-amber-300 font-mono text-[11px]">
                        {selectedOffer.detectedMismatches.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 pt-1 text-xs text-white cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={substitutionApproved}
                      disabled={Boolean(createdPool)}
                      onChange={(e) => setSubstitutionApproved(e.target.checked)}
                      className="rounded border-midnight-border bg-midnight-surface text-midnight-red focus:ring-midnight-red h-4 w-4"
                    />
                    <span>I review and explicitly approve these specification substitutions for this pool.</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* STEP 3: Initial Commitment (MOQStepCalculator)                    */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {selectedOffer && (
          <section className="bg-midnight-card border border-midnight-border rounded-xl p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-midnight-border/50 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-midnight-red/20 text-midnight-red text-xs font-bold font-mono">
                  3
                </span>
                <h2 className="text-base font-bold text-white">
                  Committed Contribution Quantity
                </h2>
              </div>
              <Badge variant="pool" className="text-[10px]">
                MOQ_R: {moqR} | Step: +{step}
              </Badge>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="pool-title-input" className="block text-xs font-semibold uppercase tracking-wider text-midnight-muted mb-1.5">
                  Pool Title
                </label>
                <input
                  id="pool-title-input"
                  type="text"
                  value={poolTitle}
                  disabled={Boolean(createdPool)}
                  onChange={(e) => setPoolTitle(e.target.value)}
                  maxLength={180}
                  className="w-full h-10 px-3 rounded-md border border-midnight-border bg-midnight-surface text-sm text-white focus:outline-none focus:ring-2 focus:ring-midnight-red transition-colors"
                />
              </div>

              {/* Reused SUJ-01 MOQStepCalculator */}
              <div>
                <MOQStepCalculator
                  targetMoq={moqW}
                  retailerMoqPercentage={pMin}
                  retailerStepPercentage={pStep}
                  minRetailerQuantity={moqR}
                  quantityStepMultiple={step}
                  baseUnitPriceMinor={basePriceMinor}
                  tiers={quantityTiers}
                  currency={currency}
                  packUnit={packUnit.toLowerCase()}
                  value={initialQuantity}
                  disabled={Boolean(createdPool)}
                  onChange={(qty) => setInitialQuantity(qty)}
                />
              </div>

              {/* Live Preview using SUJ-01 TierProgressBar */}
              <div className="pt-2">
                <span className="block text-xs font-semibold uppercase tracking-wider text-midnight-muted mb-2">
                  Estimated Pool Progress at Launch:
                </span>
                <TierProgressBar
                  totalEligibleQuantity={initialQuantity}
                  targetMoq={moqW}
                  tiers={quantityTiers}
                  baseUnitPriceMinor={basePriceMinor}
                  currency={currency}
                  packUnit={packUnit.toLowerCase()}
                />
              </div>
            </div>
          </section>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* STEP 4: Review Lifecycle & Submit                                  */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {selectedOffer && (
          <section className="bg-midnight-surface/50 border border-midnight-border rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs text-midnight-muted">
              <Clock className="h-4 w-4 text-teal-400" />
              <span>
                <strong>Authoritative 72-Hour Lifecycle:</strong> Once published, the pool opens for regional shop recruitment with an immutable 72-hour backend deadline.
              </span>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-midnight-border/50">
              <div className="text-xs text-midnight-muted">
                Initial Retailer Share: <strong className="text-white font-mono">{initialQuantity} {packUnit}</strong>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/group-buys')}
                  disabled={submitting}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>

                {createdPool ? (
                  <Button
                    type="button"
                    variant="primary"
                    loading={submitting}
                    onClick={handleRetryContribution}
                    className="flex-1 sm:flex-none"
                  >
                    Retry Contribution
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="primary"
                    loading={submitting}
                    disabled={!canPublish}
                    className="flex-1 sm:flex-none"
                  >
                    Publish 72h Group-Buy Pool
                  </Button>
                )}
              </div>
            </div>
          </section>
        )}
      </form>
    </div>
  );
}

export default GroupBuyCreatePage;
