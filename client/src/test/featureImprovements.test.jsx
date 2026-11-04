import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { ProfilePage } from '@/pages/dashboard/ProfilePage';
import { LandingPage } from '@/pages/public/LandingPage';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import * as suppliersApi from '@/api/suppliers.api';
import * as shopApi from '@/api/shop.api';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
  useOptionalAuth: vi.fn(() => ({ user: null, isAuthenticated: false })),
}));

vi.mock('@/context/NotificationContext', () => ({
  useNotifications: vi.fn(),
}));

vi.mock('@/api/shop.api', () => ({
  getMyShop: vi.fn(),
  updateMyShop: vi.fn(),
}));

vi.mock('@/api/suppliers.api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getMySupplierProfile: vi.fn(),
    updateMySupplierProfile: vi.fn(),
  };
});

const mockSupplierUser = {
  _id: 'supplier-user-01',
  name: 'Varanasi Wholesale BioPack Ltd',
  email: 'contact@biopack.in',
  role: 'SUPPLIER',
  status: 'ACTIVE',
};

const mockSupplierProfileData = {
  _id: 'supp-doc-01',
  ownerUserId: 'supplier-user-01',
  name: 'Varanasi Wholesale BioPack Ltd',
  serviceAreas: ['VARANASI', 'LUCKNOW', 'DELHI_NCR'],
  contactReference: {
    contactPerson: 'Anand Verma',
    email: 'contact@biopack.in',
    phone: '9876543210',
    whatsapp: '9876543211',
    address: 'Industrial Area Phase 2, Ramnagar, Varanasi, UP',
    gstin: '09AAACB1234D1Z5',
  },
  verificationStatus: 'VERIFIED',
  activeStatus: 'ACTIVE',
  dataSourceType: 'SUPPLIER_SUBMITTED',
};

describe('FEATURE 1: Business Profile Editing & Permanent Saving', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: mockSupplierUser,
      shop: null,
      setShop: vi.fn(),
      refreshUser: vi.fn(),
      isAuthenticated: true,
      isShopOwner: false,
      isSupplier: true,
    });

    useNotifications.mockReturnValue({
      notify: vi.fn(),
    });

    suppliersApi.getMySupplierProfile.mockResolvedValue(mockSupplierProfileData);
    suppliersApi.updateMySupplierProfile.mockResolvedValue(mockSupplierProfileData);
  });

  it('1. loads supplier profile via getMySupplierProfile and renders business identity', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('supplier-profile-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(suppliersApi.getMySupplierProfile).toHaveBeenCalled();
    });

    expect(screen.getByTestId('supplier-company-name')).toHaveTextContent('Varanasi Wholesale BioPack Ltd');
    expect(screen.getByText('Anand Verma')).toBeInTheDocument();
    expect(screen.getByText('+91 9876543210')).toBeInTheDocument();
    expect(screen.getByText('09AAACB1234D1Z5')).toBeInTheDocument();
  });

  it('2. opens populated edit form on clicking Edit Profile button', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    const editBtn = screen.getByTestId('edit-supplier-profile-button');
    await userEvent.click(editBtn);

    expect(screen.getByTestId('supplier-profile-edit-form')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Varanasi Wholesale BioPack Ltd')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Anand Verma')).toBeInTheDocument();
    expect(screen.getByDisplayValue('9876543210')).toBeInTheDocument();
    expect(screen.getByDisplayValue('09AAACB1234D1Z5')).toBeInTheDocument();
  });

  it('3. validates inputs and rejects empty company name and invalid GSTIN', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByTestId('edit-supplier-profile-button'));

    const nameInput = screen.getByDisplayValue('Varanasi Wholesale BioPack Ltd');
    await userEvent.clear(nameInput);

    const gstinInput = screen.getByDisplayValue('09AAACB1234D1Z5');
    await userEvent.clear(gstinInput);
    await userEvent.type(gstinInput, 'INVALID_GSTIN_123');

    const saveBtn = screen.getByTestId('save-supplier-profile-button');
    await userEvent.click(saveBtn);

    expect(screen.getByText('Company / Business name is required.')).toBeInTheDocument();
    expect(screen.getByText(/Invalid GSTIN format/i)).toBeInTheDocument();
    expect(suppliersApi.updateMySupplierProfile).not.toHaveBeenCalled();
  });

  it('4. successfully saves profile updates via updateMySupplierProfile and returns to view mode', async () => {
    const updatedResponse = {
      ...mockSupplierProfileData,
      name: 'Varanasi Wholesale BioPack Pvt Ltd',
      contactReference: {
        ...mockSupplierProfileData.contactReference,
        phone: '9123456780',
      },
    };
    suppliersApi.updateMySupplierProfile.mockResolvedValue(updatedResponse);

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByTestId('edit-supplier-profile-button'));

    const nameInput = screen.getByDisplayValue('Varanasi Wholesale BioPack Ltd');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Varanasi Wholesale BioPack Pvt Ltd');

    const phoneInput = screen.getByDisplayValue('9876543210');
    await userEvent.clear(phoneInput);
    await userEvent.type(phoneInput, '9123456780');

    const saveBtn = screen.getByTestId('save-supplier-profile-button');
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(suppliersApi.updateMySupplierProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Varanasi Wholesale BioPack Pvt Ltd',
          contactReference: expect.objectContaining({
            phone: '9123456780',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('supplier-profile-view')).toBeInTheDocument();
    });
    expect(screen.getByText('Wholesaler business profile updated successfully.')).toBeInTheDocument();
  });

  it('5. cancel button restores pristine supplier profile values without saving', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByTestId('edit-supplier-profile-button'));

    const nameInput = screen.getByDisplayValue('Varanasi Wholesale BioPack Ltd');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Discarded Name Edit');

    const cancelBtn = screen.getByTestId('cancel-supplier-profile-button');
    await userEvent.click(cancelBtn);

    expect(screen.getByTestId('supplier-profile-view')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-company-name')).toHaveTextContent('Varanasi Wholesale BioPack Ltd');
    expect(suppliersApi.updateMySupplierProfile).not.toHaveBeenCalled();
  });
});

// ─── FEATURE 2: 20% MOQ Minimum Rule (replaces even-integer rule) ─────────────
//
// Pool 2 (Cold Pressed Mustard Oil) data:
//   moqW = 500 tins, moqR = 10 tins (20% of 500)
//   Any integer >= 10 is valid — odd and even both accepted.
//
describe('FEATURE 2: 20% MOQ Minimum Quantity Rule in Join Group Buy Pool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openJoinModal() {
    const user = userEvent.setup();
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    // Pool-2 (mustard oil, moqR=10, unit='tins') — second card
    const joinBtns = screen.getAllByRole('button', { name: /join group buy pool/i });
    await user.click(joinBtns[1]); // pool-2
    const modalHeading = screen.getByRole('heading', { name: /join group buy pool/i });
    expect(modalHeading).toBeInTheDocument();
    return user;
  }

  it('1. rejects quantity 9 (below 10 minimum for MOQ_W=500)', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');

    await user.clear(qtyInput);
    await user.type(qtyInput, '9');

    const errorMsg = screen.getByTestId('quantity-error-message');
    expect(errorMsg).toHaveTextContent(/minimum order quantity is 10/i);
    expect(errorMsg).toHaveTextContent(/20%/i);
  });

  it('2. accepts quantity 10 (exactly at 20% minimum)', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');

    await user.clear(qtyInput);
    await user.type(qtyInput, '10');

    expect(qtyInput).toHaveValue(10);
    expect(screen.queryByTestId('quantity-error-message')).not.toBeInTheDocument();
  });

  it('3. accepts odd quantity 11 (no even-number restriction)', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');

    await user.clear(qtyInput);
    await user.type(qtyInput, '11');

    expect(qtyInput).toHaveValue(11);
    expect(screen.queryByTestId('quantity-error-message')).not.toBeInTheDocument();
  });

  it('4. accepts odd quantity 13', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');

    await user.clear(qtyInput);
    await user.type(qtyInput, '13');

    expect(qtyInput).toHaveValue(13);
    expect(screen.queryByTestId('quantity-error-message')).not.toBeInTheDocument();
  });

  it('5. accepts odd quantity 15', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');

    await user.clear(qtyInput);
    await user.type(qtyInput, '15');

    expect(qtyInput).toHaveValue(15);
    expect(screen.queryByTestId('quantity-error-message')).not.toBeInTheDocument();
  });

  it('6. accepts even quantity 12', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');

    await user.clear(qtyInput);
    await user.type(qtyInput, '12');

    expect(qtyInput).toHaveValue(12);
    expect(screen.queryByTestId('quantity-error-message')).not.toBeInTheDocument();
  });

  it('7. accepts even quantity 20', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');

    await user.clear(qtyInput);
    await user.type(qtyInput, '20');

    expect(qtyInput).toHaveValue(20);
    expect(screen.queryByTestId('quantity-error-message')).not.toBeInTheDocument();
  });

  it('8. rejects 0 — must be a positive whole number', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');

    await user.clear(qtyInput);
    await user.type(qtyInput, '0');

    expect(screen.getByTestId('quantity-error-message')).toHaveTextContent(/positive whole number/i);
  });

  it('9. plus button increases quantity by exactly 1', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');
    const initialVal = Number(qtyInput.value);

    const plusBtn = screen.getByRole('button', { name: 'Increase quantity' });
    await user.click(plusBtn);

    expect(Number(qtyInput.value)).toBe(initialVal + 1);
  });

  it('10. minus button decreases quantity by exactly 1', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');

    // First increase by 2 so we have room to decrease
    const plusBtn = screen.getByRole('button', { name: 'Increase quantity' });
    await user.click(plusBtn);
    await user.click(plusBtn);
    const afterIncrease = Number(qtyInput.value);

    const minusBtn = screen.getByRole('button', { name: 'Decrease quantity' });
    await user.click(minusBtn);

    expect(Number(qtyInput.value)).toBe(afterIncrease - 1);
  });

  it('11. minus button cannot decrease below the moqR minimum (10)', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');

    // Start at moqR = 10; minus should be disabled at or below minimum
    const initialVal = Number(qtyInput.value);
    expect(initialVal).toBe(10);

    const minusBtn = screen.getByRole('button', { name: 'Decrease quantity' });
    // The button is disabled when quantity <= moqR
    expect(minusBtn).toBeDisabled();
  });

  it('12. manual typing works for any valid positive integer >= moqR', async () => {
    const user = await openJoinModal();
    const qtyInput = screen.getByLabelText('Order Quantity');

    await user.clear(qtyInput);
    await user.type(qtyInput, '17');

    expect(qtyInput).toHaveValue(17);
    expect(screen.queryByTestId('quantity-error-message')).not.toBeInTheDocument();
  });
});
