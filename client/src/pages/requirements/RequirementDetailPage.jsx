/**
 * CoBuy AI — AI Extraction Review, Editing & Requirement Confirmation (HIM-08)
 *
 * Route: /requirements/:requirementId  (SHOP_OWNER only)
 *
 * Capabilities:
 *  1. Inspect AI-extracted information (extractedFields, confidenceScore, extractionNotes, uncertainFields).
 *  2. Review and edit user-confirmed fields (confirmedFields, Rule BR-001 validation).
 *  3. Visually distinguish AI-extracted vs user-confirmed data with uncertainty highlights.
 *  4. Save as Draft (PATCH /api/requirements/:id).
 *  5. Confirm Requirement (Rule BR-001: productName, category, requestedQuantity, quantityUnit, deliveryArea).
 *  6. Reject Requirement with confirmation dialog (PATCH /api/requirements/:id status=REJECTED).
 *  7. Manual fallback editor for FAILED_EXTRACTION status.
 *  8. Display compatible supplier offers & matching explanations once CONFIRMED (GET /api/requirements/:id/matches).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  FileText,
  Upload,
  MessageSquare,
  FileSpreadsheet,
  Clock,
  Building2,
  Tag,
  Package,
  Layers,
  ShieldCheck,
  Scale,
  Calendar,
  MapPin,
  Info,
  ExternalLink,
  Save,
  Check,
  Ban,
  RefreshCw,
  Loader2,
  ChevronRight,
  FileUp,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';

import {
  getRequirement,
  updateRequirement,
  confirmRequirement,
  rejectRequirement,
  getRequirementMatches,
  triggerExtraction,
  REQUIREMENT_STATUS,
  REQUIREMENT_SOURCE,
  getApiErrorMessage,
} from '@/api/requirements.api';

// ─── Status Badge Configuration ───────────────────────────────────────────────

const STATUS_CONFIG = {
  [REQUIREMENT_STATUS.DRAFT]: {
    label: 'Draft',
    variant: 'neutral',
  },
  [REQUIREMENT_STATUS.PROCESSING]: {
    label: 'Processing',
    variant: 'warning',
  },
  [REQUIREMENT_STATUS.NEEDS_REVIEW]: {
    label: 'Needs Review',
    variant: 'warning',
  },
  [REQUIREMENT_STATUS.CONFIRMED]: {
    label: 'Confirmed',
    variant: 'success',
  },
  [REQUIREMENT_STATUS.FAILED_EXTRACTION]: {
    label: 'Extraction Failed',
    variant: 'error',
  },
  [REQUIREMENT_STATUS.REJECTED]: {
    label: 'Rejected',
    variant: 'error',
  },
  [REQUIREMENT_STATUS.ARCHIVED]: {
    label: 'Archived',
    variant: 'neutral',
  },
};

const UNIT_OPTIONS = [
  { value: 'BOX', label: 'Box' },
  { value: 'CARTON', label: 'Carton' },
  { value: 'UNIT', label: 'Unit / Pieces (PCS)' },
  { value: 'KG', label: 'Kilograms (kg)' },
  { value: 'G', label: 'Grams (g)' },
  { value: 'L', label: 'Litres (l)' },
  { value: 'ML', label: 'Millilitres (ml)' },
  { value: 'BAG', label: 'Bag' },
  { value: 'DOZEN', label: 'Dozen' },
];

const CATEGORY_OPTIONS = [
  { value: 'PACKAGING', label: 'Packaging Materials' },
  { value: 'GROCERIES', label: 'Groceries & Staples' },
  { value: 'BEVERAGES', label: 'Beverages' },
  { value: 'DAIRY', label: 'Dairy & Eggs' },
  { value: 'SNACKS', label: 'Snacks & Confectionery' },
  { value: 'CLEANING', label: 'Cleaning & Hygiene' },
  { value: 'BAKERY', label: 'Bakery Ingredients' },
  { value: 'PRINTING', label: 'Printing & POS Supplies' },
  { value: 'OTHER', label: 'Other' },
];

export default function RequirementDetailPage() {
  const { requirementId } = useParams();
  const navigate = useNavigate();

  // ── Requirement & State ──────────────────────────────────────────────────
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // ── Form State (Buyer-Edited Specifications) ─────────────────────────────
  const [form, setForm] = useState({
    productName: '',
    category: '',
    requestedQuantity: '',
    quantityUnit: '',
    deliveryArea: '',
    packSize: '',
    material: '',
    capacityOrSize: '',
    foodSafeRequired: '',
    brandConstraint: '',
    requiredBy: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // ── Action States ────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isRetryingExtraction, setIsRetryingExtraction] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);

  // ── Matching Supplier Offers State (Once Confirmed) ──────────────────────
  const [matches, setMatches] = useState(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState(null);

  // ── Populate Form from Requirement ───────────────────────────────────────
  const initFormFromRequirement = useCallback((req) => {
    if (!req) return;
    const confirmed = req.confirmedFields || {};
    const extracted = req.extractedFields || {};

    const requiredByRaw = confirmed.requiredBy || extracted.requiredBy || req.requiredBy;
    let requiredByFormatted = '';
    if (requiredByRaw) {
      try {
        const d = new Date(requiredByRaw);
        if (!isNaN(d.getTime())) {
          requiredByFormatted = d.toISOString().split('T')[0];
        }
      } catch {
        requiredByFormatted = '';
      }
    }

    const foodSafeVal =
      confirmed.foodSafeRequired !== null && confirmed.foodSafeRequired !== undefined
        ? String(confirmed.foodSafeRequired)
        : extracted.foodSafeRequired !== null && extracted.foodSafeRequired !== undefined
        ? String(extracted.foodSafeRequired)
        : '';

    setForm({
      productName: confirmed.productName || extracted.productName || req.productName || '',
      category: (confirmed.category || extracted.category || req.category || '').toUpperCase(),
      requestedQuantity:
        confirmed.requestedQuantity ??
        extracted.requestedQuantity ??
        req.requestedQuantity ??
        '',
      quantityUnit: (
        confirmed.quantityUnit ||
        extracted.quantityUnit ||
        req.quantityUnit ||
        ''
      ).toUpperCase(),
      deliveryArea: (
        confirmed.deliveryArea ||
        extracted.deliveryArea ||
        req.deliveryArea ||
        ''
      ).toUpperCase(),
      packSize: confirmed.packSize || extracted.packSize || req.packSize || '',
      material: confirmed.material || extracted.material || '',
      capacityOrSize: confirmed.capacityOrSize || extracted.capacityOrSize || '',
      foodSafeRequired: foodSafeVal,
      brandConstraint: confirmed.brandConstraint || extracted.brandConstraint || '',
      requiredBy: requiredByFormatted,
      notes:
        confirmed.additionalSpecifications?.notes ||
        confirmed.additionalSpecifications?.get?.('notes') ||
        req.originalDescription ||
        '',
    });
  }, []);

  // ── Fetch Matches for Confirmed Requirement ──────────────────────────────
  const fetchMatches = useCallback(async (id) => {
    setMatchesLoading(true);
    setMatchesError(null);
    try {
      const res = await getRequirementMatches(id);
      const data = res?.data?.data !== undefined ? res.data.data : res?.data;
      setMatches(data || null);
    } catch (err) {
      setMatchesError(getApiErrorMessage(err, 'Failed to fetch candidate supplier offers.'));
    } finally {
      setMatchesLoading(false);
    }
  }, []);

  // ── Fetch Requirement by ID ──────────────────────────────────────────────
  const fetchReqData = useCallback(async () => {
    if (!requirementId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await getRequirement(requirementId);
      const req = res?.data?.data !== undefined ? res.data.data : res?.data;
      if (!req) {
        throw new Error('Requirement record not found.');
      }
      setRequirement(req);
      initFormFromRequirement(req);

      // If already confirmed, fetch matching supplier offers
      if (req.status === REQUIREMENT_STATUS.CONFIRMED) {
        fetchMatches(req._id || req.id || requirementId);
      }
    } catch (err) {
      setFetchError(getApiErrorMessage(err, 'Failed to retrieve requirement details.'));
    } finally {
      setLoading(false);
    }
  }, [requirementId, initFormFromRequirement, fetchMatches]);

  useEffect(() => {
    fetchReqData();
  }, [fetchReqData]);

  // ── Form Input Change Handler ────────────────────────────────────────────
  const handleInputChange = (field) => (e) => {
    const val = e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (actionError) setActionError(null);
  };

  // ── Build Confirmed Fields Payload ───────────────────────────────────────
  const buildConfirmedFieldsPayload = () => {
    const requestedQtyNum = Number(form.requestedQuantity);
    return {
      productName: form.productName.trim() || null,
      category: form.category.trim().toUpperCase() || null,
      requestedQuantity: !isNaN(requestedQtyNum) && requestedQtyNum > 0 ? requestedQtyNum : null,
      quantityUnit: form.quantityUnit.trim().toUpperCase() || null,
      deliveryArea: form.deliveryArea.trim().toUpperCase() || null,
      packSize: form.packSize.trim() || null,
      material: form.material.trim() || null,
      capacityOrSize: form.capacityOrSize.trim() || null,
      foodSafeRequired:
        form.foodSafeRequired === 'true'
          ? true
          : form.foodSafeRequired === 'false'
          ? false
          : null,
      brandConstraint: form.brandConstraint.trim() || null,
      requiredBy: form.requiredBy ? new Date(form.requiredBy).toISOString() : null,
      additionalSpecifications: form.notes.trim() ? { notes: form.notes.trim() } : {},
    };
  };

  // ── Validate Rule BR-001 (Mandatory Confirmation Constraint) ────────────
  const validateBR001 = () => {
    const errors = {};
    if (!form.productName.trim()) {
      errors.productName = 'Product name is mandatory for confirmation (Rule BR-001).';
    }
    if (!form.category.trim()) {
      errors.category = 'Category is mandatory for confirmation (Rule BR-001).';
    }
    const qty = Number(form.requestedQuantity);
    if (!form.requestedQuantity || isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
      errors.requestedQuantity =
        'Requested quantity must be a positive whole number >= 1 (Rule BR-001).';
    }
    if (!form.quantityUnit.trim()) {
      errors.quantityUnit = 'Quantity unit is mandatory for confirmation (Rule BR-001).';
    }
    if (!form.deliveryArea.trim()) {
      errors.deliveryArea = 'Delivery area is mandatory for confirmation (Rule BR-001).';
    }
    return errors;
  };

  // ── Action: Save as Draft ────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    if (isSaving || isConfirming || isRejecting) return;
    setIsSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const confirmedFields = buildConfirmedFieldsPayload();
      const res = await updateRequirement(requirementId, {
        confirmedFields,
        status: requirement?.status === REQUIREMENT_STATUS.CONFIRMED ? undefined : REQUIREMENT_STATUS.DRAFT,
      });

      const updated = res?.data?.data !== undefined ? res.data.data : res?.data;
      if (updated) {
        setRequirement(updated);
        initFormFromRequirement(updated);
      }
      setActionSuccess('Requirement specifications saved successfully as draft.');
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Failed to save requirement specifications.'));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Action: Confirm Requirement (Rule BR-001) ────────────────────────────
  const handleConfirmRequirement = async () => {
    if (isSaving || isConfirming || isRejecting) return;
    setActionError(null);
    setActionSuccess(null);

    // Validate Rule BR-001
    const errors = validateBR001();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setActionError(
        'Rule BR-001 Validation Failed: Cannot confirm requirement until all 5 mandatory fields (Product Name, Category, Quantity, Unit, Delivery Area) are provided.'
      );
      return;
    }

    setIsConfirming(true);
    try {
      const confirmedFields = buildConfirmedFieldsPayload();
      const res = await confirmRequirement(requirementId, confirmedFields);
      const updated = res?.data?.data !== undefined ? res.data.data : res?.data;
      if (updated) {
        setRequirement(updated);
        initFormFromRequirement(updated);
      }
      setActionSuccess('Requirement confirmed successfully! Rule BR-001 validated.');
      // Fetch matching supplier offers
      fetchMatches(requirementId);
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Failed to confirm requirement.'));
    } finally {
      setIsConfirming(false);
    }
  };

  // ── Action: Reject Requirement ───────────────────────────────────────────
  const handleRejectRequirement = async () => {
    if (isRejecting) return;
    setIsRejecting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await rejectRequirement(requirementId);
      const updated = res?.data?.data !== undefined ? res.data.data : res?.data;
      if (updated) {
        setRequirement(updated);
      }
      setRejectDialogOpen(false);
      setActionSuccess('Requirement has been rejected and marked as inactive.');
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Failed to reject requirement.'));
    } finally {
      setIsRejecting(false);
    }
  };

  // ── Action: Retry AI Extraction ──────────────────────────────────────────
  const handleRetryExtraction = async () => {
    if (isRetryingExtraction) return;
    setIsRetryingExtraction(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await triggerExtraction(requirementId);
      const updated = res?.data?.data !== undefined ? res.data.data : res?.data;
      if (updated) {
        setRequirement(updated);
        initFormFromRequirement(updated);
      }
      setActionSuccess('AI extraction re-triggered successfully. Attributes updated.');
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Failed to re-trigger AI extraction.'));
    } finally {
      setIsRetryingExtraction(false);
    }
  };

  // ── Loading Skeleton State ───────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="max-w-6xl mx-auto space-y-6 py-6"
        data-testid="requirement-detail-skeleton"
        aria-busy="true"
        aria-label="Loading requirement details"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-36 rounded" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 rounded" />
          <Skeleton className="h-4 w-96 rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  // ── Fetch Error State ────────────────────────────────────────────────────
  if (fetchError || !requirement) {
    return (
      <div
        className="max-w-2xl mx-auto space-y-6 py-12"
        data-testid="requirement-detail-error"
      >
        <Link
          to="/requirements"
          className="inline-flex items-center text-sm text-midnight-muted hover:text-midnight-text transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Requirements
        </Link>
        <Alert variant="error">
          <AlertTitle>Requirement Not Found or Inaccessible</AlertTitle>
          <AlertDescription>
            {fetchError || 'Unable to access the requested purchasing requirement. Please check the ID or your account permissions.'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => navigate('/requirements')}>
          Return to Requirements List
        </Button>
      </div>
    );
  }

  // ── Derive Attributes & Metadata ─────────────────────────────────────────
  const status = requirement.status || REQUIREMENT_STATUS.DRAFT;
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG[REQUIREMENT_STATUS.DRAFT];
  const isConfirmed = status === REQUIREMENT_STATUS.CONFIRMED;
  const isRejected = status === REQUIREMENT_STATUS.REJECTED;
  const isFailedExtraction = status === REQUIREMENT_STATUS.FAILED_EXTRACTION;

  const extracted = requirement.extractedFields || {};
  const confirmed = requirement.confirmedFields || {};
  const uncertainFieldsList = Array.isArray(requirement.uncertainFields)
    ? requirement.uncertainFields
    : [];

  const confidenceScore =
    requirement.confidenceScore ??
    extracted.confidenceScore ??
    null;

  const isDemoExtraction =
    extracted.isDemoExtraction ||
    requirement.extractionNotes?.toLowerCase().includes('mock') ||
    requirement.extractionNotes?.toLowerCase().includes('demo');

  const docInfo = requirement.uploadedDocumentId && typeof requirement.uploadedDocumentId === 'object'
    ? requirement.uploadedDocumentId
    : null;

  const isFieldUncertain = (fieldName) =>
    uncertainFieldsList.includes(fieldName) ||
    uncertainFieldsList.includes(fieldName.toLowerCase());

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6" data-testid="requirement-detail-page">
      {/* ── Breadcrumb & Navigation Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          to="/requirements"
          className="inline-flex items-center text-sm text-midnight-muted hover:text-midnight-text transition-colors w-fit focus:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red rounded"
          aria-label="Back to Requirements list"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Requirements
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-midnight-muted uppercase tracking-wider">Status:</span>
          <Badge variant={statusCfg.variant} className="text-xs px-2.5 py-1" data-testid="status-badge">
            {statusCfg.label}
          </Badge>
          {isConfirmed && (
            <Badge variant="success" className="text-xs flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Rule BR-001 Validated
            </Badge>
          )}
        </div>
      </div>

      {/* ── Page Title & Context Banner ── */}
      <div className="border-b border-midnight-border/70 pb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight" data-testid="requirement-title">
          {form.productName || requirement.productName || requirement.originalDescription || 'Purchasing Requirement'}
        </h1>
        <p className="text-xs sm:text-sm text-midnight-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Requirement ID: <code className="font-mono text-midnight-text">{requirement._id || requirement.id}</code></span>
          <span className="text-midnight-border">·</span>
          <span>Source: <strong className="text-midnight-text">{requirement.sourceType || requirement.source || 'FORM'}</strong></span>
          {requirement.createdAt && (
            <>
              <span className="text-midnight-border">·</span>
              <span>Submitted {new Date(requirement.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </>
          )}
        </p>
      </div>

      {/* ── Feedback Banners ── */}
      {actionSuccess && (
        <Alert variant="success" data-testid="action-success-banner">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{actionSuccess}</AlertDescription>
        </Alert>
      )}

      {actionError && (
        <Alert variant="error" data-testid="action-error-banner">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Action Notice</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* ── Extraction Failed Alert & Manual Fallback ── */}
      {isFailedExtraction && (
        <Alert variant="error" data-testid="failed-extraction-alert">
          <AlertTriangle className="h-4 w-4" />
          <div className="flex-1">
            <AlertTitle>AI Attribute Extraction Could Not Be Completed</AlertTitle>
            <AlertDescription>
              {requirement.extractionNotes ||
                'AI extraction could not detect structured product attributes from your inquiry. You can manually complete the required fields below to save as draft or confirm.'}
            </AlertDescription>
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryExtraction}
                disabled={isRetryingExtraction}
                data-testid="retry-extraction-button"
              >
                {isRetryingExtraction ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Retrying Extraction…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Retry AI Extraction
                  </>
                )}
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {/* ── Uncertain Fields Alert Notice ── */}
      {uncertainFieldsList.length > 0 && !isConfirmed && (
        <Alert variant="warning" data-testid="uncertain-fields-banner">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Buyer Review Required — Uncertain Attributes Detected</AlertTitle>
          <AlertDescription>
            The AI extraction identified {uncertainFieldsList.length} field(s) with uncertainty or missing information ({uncertainFieldsList.join(', ')}). Review highlighted fields in the editor below and enter correct values before confirming.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Main Two-Column Layout: AI Extracted vs User Confirmed ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ─────────────────────────────────────────────────────────── */}
        {/* COLUMN 1: AI-EXTRACTED ATTRIBUTES (READ-ONLY PROVENANCE)    */}
        {/* ─────────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="ai-extracted-heading"
          className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-6 shadow-lg"
          data-testid="ai-extracted-section"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-midnight-border/70 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-red-950/40 border border-midnight-red/30 text-midnight-red">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 id="ai-extracted-heading" className="text-lg font-semibold text-white">
                  AI-Extracted Fields
                </h2>
                <p className="text-xs text-midnight-muted">Raw AI model output &amp; uncertainty signals</p>
              </div>
            </div>

            {/* AI Confidence & Provenance Badges */}
            <div className="flex flex-wrap items-center gap-1.5">
              {confidenceScore !== null && (
                <Badge
                  variant={confidenceScore >= 0.8 ? 'success' : 'warning'}
                  data-testid="confidence-badge"
                  className="text-xs"
                >
                  {Math.round(confidenceScore * 100)}% Confidence
                </Badge>
              )}
              {isDemoExtraction !== undefined && (
                <Badge variant={isDemoExtraction ? 'neutral' : 'provenance'} data-testid="provenance-badge" className="text-xs">
                  {isDemoExtraction ? 'Deterministic Mock AI' : 'Live Claude/Gemini AI'}
                </Badge>
              )}
            </div>
          </div>

          {/* Original Source Input / Document Details */}
          <div className="rounded-lg bg-midnight-surface/80 border border-midnight-border p-3.5 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-midnight-muted flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              Source Input &amp; Ingestion Trace
            </div>
            {docInfo ? (
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <FileUp className="h-4 w-4 text-midnight-red" />
                <span className="font-medium text-white">{docInfo.originalFilename}</span>
                <span className="text-midnight-muted">({docInfo.mimeType}, {(docInfo.sizeBytes / 1024).toFixed(1)} KB)</span>
              </div>
            ) : requirement.originalDescription ? (
              <p className="text-xs text-slate-300 italic leading-relaxed line-clamp-3">
                "{requirement.originalDescription}"
              </p>
            ) : (
              <p className="text-xs text-midnight-muted italic">Direct manual entry form</p>
            )}
          </div>

          {/* AI-Extracted Attributes Readout */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-midnight-muted">
              Extracted Attribute Values
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-midnight-surface/60 border border-midnight-border/70 space-y-1">
                <span className="text-xs text-midnight-muted">Product Name</span>
                <p className="font-medium text-white break-words">
                  {extracted.productName || <span className="text-slate-500 italic">None detected</span>}
                </p>
                {isFieldUncertain('productName') && (
                  <Badge variant="warning" className="text-[10px]" data-testid="uncertain-badge-productName">
                    Uncertain
                  </Badge>
                )}
              </div>

              <div className="p-3 rounded-lg bg-midnight-surface/60 border border-midnight-border/70 space-y-1">
                <span className="text-xs text-midnight-muted">Category</span>
                <p className="font-medium text-white">
                  {extracted.category || <span className="text-slate-500 italic">None detected</span>}
                </p>
                {isFieldUncertain('category') && (
                  <Badge variant="warning" className="text-[10px]" data-testid="uncertain-badge-category">
                    Uncertain
                  </Badge>
                )}
              </div>

              <div className="p-3 rounded-lg bg-midnight-surface/60 border border-midnight-border/70 space-y-1">
                <span className="text-xs text-midnight-muted">Requested Quantity</span>
                <p className="font-medium text-white font-mono">
                  {extracted.requestedQuantity != null ? (
                    `${extracted.requestedQuantity} ${extracted.quantityUnit || ''}`
                  ) : (
                    <span className="text-slate-500 italic">None detected</span>
                  )}
                </p>
                {isFieldUncertain('requestedQuantity') && (
                  <Badge variant="warning" className="text-[10px]" data-testid="uncertain-badge-requestedQuantity">
                    Uncertain
                  </Badge>
                )}
              </div>

              <div className="p-3 rounded-lg bg-midnight-surface/60 border border-midnight-border/70 space-y-1">
                <span className="text-xs text-midnight-muted">Delivery Area</span>
                <p className="font-medium text-white">
                  {extracted.deliveryArea || <span className="text-slate-500 italic">None detected</span>}
                </p>
                {isFieldUncertain('deliveryArea') && (
                  <Badge variant="warning" className="text-[10px]" data-testid="uncertain-badge-deliveryArea">
                    Uncertain
                  </Badge>
                )}
              </div>

              <div className="p-3 rounded-lg bg-midnight-surface/60 border border-midnight-border/70 space-y-1">
                <span className="text-xs text-midnight-muted">Pack Size</span>
                <p className="font-medium text-white">
                  {extracted.packSize || <span className="text-slate-500 italic">None</span>}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-midnight-surface/60 border border-midnight-border/70 space-y-1">
                <span className="text-xs text-midnight-muted">Material</span>
                <p className="font-medium text-white">
                  {extracted.material || <span className="text-slate-500 italic">None</span>}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-midnight-surface/60 border border-midnight-border/70 space-y-1">
                <span className="text-xs text-midnight-muted">Capacity / Size</span>
                <p className="font-medium text-white">
                  {extracted.capacityOrSize || <span className="text-slate-500 italic">None</span>}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-midnight-surface/60 border border-midnight-border/70 space-y-1">
                <span className="text-xs text-midnight-muted">Food-Safe Required</span>
                <p className="font-medium text-white">
                  {extracted.foodSafeRequired === true ? 'Yes' : extracted.foodSafeRequired === false ? 'No' : <span className="text-slate-500 italic">Unspecified</span>}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-midnight-surface/60 border border-midnight-border/70 space-y-1 sm:col-span-2">
                <span className="text-xs text-midnight-muted">Brand Constraint</span>
                <p className="font-medium text-white">
                  {extracted.brandConstraint || <span className="text-slate-500 italic">None</span>}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* COLUMN 2: USER-CONFIRMED FIELDS & SPECIFICATION EDITOR     */}
        {/* ─────────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="user-confirmed-heading"
          className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-6 shadow-lg"
          data-testid="user-confirmed-section"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-midnight-border/70 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 id="user-confirmed-heading" className="text-lg font-semibold text-white">
                  User-Confirmed Specifications
                </h2>
                <p className="text-xs text-midnight-muted">Review, correct, and legally confirm procurement values</p>
              </div>
            </div>
            {isConfirmed && (
              <Badge variant="success" className="text-xs self-start sm:self-auto">
                Confirmed &amp; Locked
              </Badge>
            )}
          </div>

          <form onSubmit={(e) => e.preventDefault()} className="space-y-4" noValidate>
            {/* Product Name (Mandatory BR-001) */}
            <div className="space-y-1">
              <Input
                label="Product Name *"
                id="edit-product-name"
                data-testid="input-product-name"
                placeholder="e.g. 12-oz Paper Coffee Cups"
                value={form.productName}
                onChange={handleInputChange('productName')}
                error={formErrors.productName}
                disabled={isConfirmed || isRejected}
              />
              {isFieldUncertain('productName') && !isConfirmed && (
                <p className="text-[11px] text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Flagged as uncertain by AI. Please verify.
                </p>
              )}
            </div>

            {/* Category (Mandatory BR-001) */}
            <div className="space-y-1">
              <Select
                label="Category *"
                id="edit-category"
                data-testid="select-category"
                options={CATEGORY_OPTIONS}
                placeholder="Select product category"
                value={form.category}
                onChange={handleInputChange('category')}
                error={formErrors.category}
                disabled={isConfirmed || isRejected}
              />
              {isFieldUncertain('category') && !isConfirmed && (
                <p className="text-[11px] text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Flagged as uncertain by AI. Please verify.
                </p>
              )}
            </div>

            {/* Quantity & Unit (Mandatory BR-001) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Input
                  label="Requested Quantity *"
                  id="edit-quantity"
                  data-testid="input-quantity"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 25"
                  value={form.requestedQuantity}
                  onChange={handleInputChange('requestedQuantity')}
                  error={formErrors.requestedQuantity}
                  disabled={isConfirmed || isRejected}
                />
                {isFieldUncertain('requestedQuantity') && !isConfirmed && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Uncertain quantity.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Select
                  label="Quantity Unit *"
                  id="edit-unit"
                  data-testid="select-unit"
                  options={UNIT_OPTIONS}
                  placeholder="Select unit"
                  value={form.quantityUnit}
                  onChange={handleInputChange('quantityUnit')}
                  error={formErrors.quantityUnit}
                  disabled={isConfirmed || isRejected}
                />
                {isFieldUncertain('quantityUnit') && !isConfirmed && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Uncertain unit.
                  </p>
                )}
              </div>
            </div>

            {/* Delivery Area (Mandatory BR-001) */}
            <div className="space-y-1">
              <Input
                label="Delivery Area / Region *"
                id="edit-delivery-area"
                data-testid="input-delivery-area"
                placeholder="e.g. LUCKNOW, DELHI_NCR, MUMBAI"
                value={form.deliveryArea}
                onChange={handleInputChange('deliveryArea')}
                error={formErrors.deliveryArea}
                disabled={isConfirmed || isRejected}
              />
              {isFieldUncertain('deliveryArea') && !isConfirmed && (
                <p className="text-[11px] text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Delivery area was missing or uncertain.
                </p>
              )}
            </div>

            {/* Pack Size & Material */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Pack Size (optional)"
                id="edit-pack-size"
                data-testid="input-pack-size"
                placeholder="e.g. 1000 pieces per box"
                value={form.packSize}
                onChange={handleInputChange('packSize')}
                disabled={isConfirmed || isRejected}
              />

              <Input
                label="Material (optional)"
                id="edit-material"
                data-testid="input-material"
                placeholder="e.g. Food-safe PE-lined paper"
                value={form.material}
                onChange={handleInputChange('material')}
                disabled={isConfirmed || isRejected}
              />
            </div>

            {/* Capacity / Size & Food-Safe */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Capacity or Size (optional)"
                id="edit-capacity"
                data-testid="input-capacity"
                placeholder="e.g. 12 oz (350ml)"
                value={form.capacityOrSize}
                onChange={handleInputChange('capacityOrSize')}
                disabled={isConfirmed || isRejected}
              />

              <Select
                label="Food-Safe Certified"
                id="edit-food-safe"
                data-testid="select-food-safe"
                options={[
                  { value: 'true', label: 'Yes — Food-Safe Certification Required' },
                  { value: 'false', label: 'No / Not Applicable' },
                ]}
                placeholder="Select requirement"
                value={form.foodSafeRequired}
                onChange={handleInputChange('foodSafeRequired')}
                disabled={isConfirmed || isRejected}
              />
            </div>

            {/* Brand Constraint & Required-By Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Brand Constraint (optional)"
                id="edit-brand"
                data-testid="input-brand"
                placeholder="e.g. India Gate, Amul, Any"
                value={form.brandConstraint}
                onChange={handleInputChange('brandConstraint')}
                disabled={isConfirmed || isRejected}
              />

              <Input
                label="Required-By Date (optional)"
                id="edit-date"
                data-testid="input-date"
                type="date"
                value={form.requiredBy}
                onChange={handleInputChange('requiredBy')}
                disabled={isConfirmed || isRejected}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label htmlFor="edit-notes" className="block text-xs font-medium uppercase tracking-wide text-midnight-muted">
                Additional Specifications &amp; Instructions
              </label>
              <textarea
                id="edit-notes"
                data-testid="textarea-notes"
                rows={2}
                placeholder="Delivery instructions, packaging details, preferred drop time…"
                value={form.notes}
                onChange={handleInputChange('notes')}
                disabled={isConfirmed || isRejected}
                className="w-full rounded-md border border-midnight-border bg-midnight-surface px-3 py-2 text-sm text-midnight-text placeholder:text-midnight-muted/60 focus:outline-none focus:ring-2 focus:ring-midnight-red disabled:opacity-50 resize-y min-h-[60px]"
              />
            </div>

            {/* ── Action Buttons ── */}
            {!isRejected && (
              <div className="pt-4 border-t border-midnight-border/70 flex flex-wrap items-center gap-3">
                {!isConfirmed ? (
                  <>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleConfirmRequirement}
                      disabled={isConfirming || isSaving}
                      data-testid="confirm-requirement-button"
                    >
                      {isConfirming ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Confirming…
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Confirm Requirement
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleSaveDraft}
                      disabled={isSaving || isConfirming}
                      data-testid="save-draft-button"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving Draft…
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save as Draft
                        </>
                      )}
                    </Button>

                    {/* Reject Dialog Trigger */}
                    <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          type="button"
                          variant="danger"
                          data-testid="reject-dialog-trigger"
                          className="ml-auto"
                        >
                          <Ban className="h-4 w-4 mr-1.5" />
                          Reject
                        </Button>
                      </DialogTrigger>
                      <DialogContent data-testid="reject-modal">
                        <DialogHeader>
                          <DialogTitle className="text-rose-400 flex items-center gap-2">
                            <XCircle className="h-5 w-5" />
                            Reject Purchasing Requirement?
                          </DialogTitle>
                          <DialogDescription>
                            Are you sure you want to reject this requirement? Once rejected, it will be marked as inactive and cannot be matched with supplier offers. This action does not delete previous audit history.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:gap-0">
                          <DialogClose asChild>
                            <Button variant="outline" size="sm">
                              Cancel
                            </Button>
                          </DialogClose>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={handleRejectRequirement}
                            disabled={isRejecting}
                            data-testid="confirm-reject-button"
                          >
                            {isRejecting ? 'Rejecting…' : 'Yes, Reject Requirement'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      This requirement is confirmed and locked for group-buy pool creation.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/suppliers')}
                    >
                      Explore Wholesale Catalogue
                    </Button>
                  </div>
                )}
              </div>
            )}
          </form>
        </section>
      </div>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* SECTION 3: COMPATIBLE SUPPLIER OFFERS (ONCE CONFIRMED)      */}
      {/* ─────────────────────────────────────────────────────────── */}
      {isConfirmed && (
        <section
          aria-labelledby="supplier-matches-heading"
          className="rounded-xl border border-midnight-border bg-midnight-card p-6 space-y-6 shadow-xl"
          data-testid="compatible-offers-section"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-midnight-border/70 pb-4">
            <div>
              <h2 id="supplier-matches-heading" className="text-xl font-bold text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-midnight-emerald" />
                Compatible Wholesale Supplier Offers
              </h2>
              <p className="text-xs text-midnight-muted mt-1">
                Evaluated against confirmed specifications, delivery area, and MOQ compatibility
              </p>
            </div>
            {matches && (
              <Badge variant="pool" data-testid="matches-count-badge" className="text-xs">
                {matches.totalQualified ?? matches.qualifiedMatches?.length ?? 0} Qualified Match(es)
              </Badge>
            )}
          </div>

          {/* Matches Loading */}
          {matchesLoading && (
            <div className="space-y-3 py-6" data-testid="matches-loading">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          )}

          {/* Matches Error */}
          {matchesError && !matchesLoading && (
            <Alert variant="error" data-testid="matches-error">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Could Not Retrieve Candidate Offers</AlertTitle>
              <AlertDescription>{matchesError}</AlertDescription>
            </Alert>
          )}

          {/* Matches Populated List */}
          {!matchesLoading && !matchesError && matches?.qualifiedMatches?.length > 0 && (
            <div className="space-y-3" role="list" aria-label="Qualified supplier offers" data-testid="qualified-matches-list">
              {matches.qualifiedMatches.map((offer, idx) => (
                <div
                  key={offer.offerId || idx}
                  role="listitem"
                  className="rounded-lg border border-midnight-border bg-midnight-surface p-4 hover:border-slate-500 transition-colors space-y-3"
                  data-testid={`match-offer-${offer.offerId || idx}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        {offer.productName || offer.supplierName || `Offer #${offer.offerId?.slice(-6) || idx + 1}`}
                      </h4>
                      {offer.supplierName && (
                        <p className="text-xs text-midnight-muted flex items-center gap-1 mt-0.5">
                          <Building2 className="h-3 w-3" /> Supplier: {offer.supplierName}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {offer.confidenceScore !== undefined && (
                        <Badge variant="success" className="text-[11px]">
                          {Math.round(offer.confidenceScore * 100)}% Spec Match
                        </Badge>
                      )}
                      {offer.requiresSubstitutionApproval && (
                        <Badge variant="warning" className="text-[11px]">
                          Requires Substitution Approval
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Match Reasons */}
                  {Array.isArray(offer.matchReasons) && offer.matchReasons.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                        Compatibility Highlights:
                      </p>
                      <ul className="text-xs text-slate-300 space-y-0.5 list-disc list-inside">
                        {offer.matchReasons.map((reason, rIdx) => (
                          <li key={rIdx}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Detected Mismatches Notice */}
                  {Array.isArray(offer.detectedMismatches) && offer.detectedMismatches.length > 0 && (
                    <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/20 rounded p-2">
                      <span className="font-semibold">Minor Variations: </span>
                      {offer.detectedMismatches.join('; ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Matches Empty State */}
          {!matchesLoading && !matchesError && (!matches?.qualifiedMatches || matches.qualifiedMatches.length === 0) && (
            <div
              className="py-10 text-center rounded-lg border border-dashed border-midnight-border bg-midnight-surface/40 p-6"
              data-testid="no-matches-notice"
            >
              <Package className="h-8 w-8 text-midnight-muted mx-auto mb-2" />
              <p className="text-sm font-medium text-midnight-text">No active supplier offers currently match all criteria</p>
              <p className="text-xs text-midnight-muted max-w-md mx-auto mt-1">
                We evaluated current catalogue offers against category <strong className="text-midnight-text">{form.category || 'your category'}</strong> and delivery area <strong className="text-midnight-text">{form.deliveryArea || 'your area'}</strong>. When new regional wholesalers quote compatible inventory, matches will appear here automatically.
              </p>
              <div className="mt-4">
                <Button variant="outline" size="sm" onClick={() => navigate('/suppliers')}>
                  Browse All Wholesale Offers
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
