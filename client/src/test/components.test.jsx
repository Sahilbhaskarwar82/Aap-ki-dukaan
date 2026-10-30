import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Toaster, toast } from '@/components/ui/Toast';

describe('HIM-01: Design System Primitives', () => {
  describe('Button.jsx', () => {
    it('renders with default primary variant', () => {
      render(<Button>Click Me</Button>);
      const btn = screen.getByRole('button', { name: /click me/i });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveClass('bg-midnight-red');
    });

    it('renders secondary and outline variants', () => {
      const { rerender } = render(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-midnight-surface');

      rerender(<Button variant="outline">Outline</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-transparent');
    });

    it('handles disabled and loading states', () => {
      const { rerender } = render(<Button disabled>Disabled</Button>);
      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();

      rerender(<Button loading>Loading</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.getByRole('button')).toHaveTextContent('Loading');
    });
  });

  describe('Input.jsx', () => {
    it('renders with label and helper text', () => {
      render(
        <Input
          id="test-input"
          label="Business Name"
          helperText="Enter registered name"
          placeholder="e.g. Ramesh Kirana"
        />
      );
      expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
      expect(screen.getByText(/enter registered name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/ramesh kirana/i)).toBeInTheDocument();
    });

    it('renders validation error with aria-invalid', () => {
      render(
        <Input
          id="err-input"
          label="GST Number"
          error="Invalid GST format"
        />
      );
      const input = screen.getByLabelText(/gst number/i);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText(/invalid gst format/i)).toBeInTheDocument();
    });
  });

  describe('Select.jsx', () => {
    it('renders select with options and handles selection', async () => {
      const user = userEvent.setup();
      const options = [
        { value: 'packaging', label: 'Packaging' },
        { value: 'food', label: 'Food & Beverage' },
      ];
      render(
        <Select
          id="category-select"
          label="Category"
          options={options}
          defaultValue="packaging"
        />
      );

      const select = screen.getByLabelText(/category/i);
      expect(select).toBeInTheDocument();
      expect(select).toHaveValue('packaging');

      await user.selectOptions(select, 'food');
      expect(select).toHaveValue('food');
    });
  });

  describe('Table.jsx', () => {
    it('renders table headers, rows, and empty state', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shop</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Shop A</TableCell>
              <TableCell>20 boxes</TableCell>
              <TableCell>₹1,600</TableCell>
            </TableRow>
            <TableEmpty colSpan={3} message="No additional shops" />
          </TableBody>
        </Table>
      );

      expect(screen.getByText('Shop A')).toBeInTheDocument();
      expect(screen.getByText('20 boxes')).toBeInTheDocument();
      expect(screen.getByText('₹1,600')).toBeInTheDocument();
      expect(screen.getByText('No additional shops')).toBeInTheDocument();
    });
  });

  describe('Badge.jsx', () => {
    it('renders multiple status badge variants', () => {
      const { rerender } = render(<Badge variant="success">MOQ Reached</Badge>);
      expect(screen.getByText('MOQ Reached')).toHaveClass('text-emerald-400');

      rerender(<Badge variant="warning">72h Expiring</Badge>);
      expect(screen.getByText('72h Expiring')).toHaveClass('text-amber-400');

      rerender(<Badge variant="pool">Group Pool Active</Badge>);
      expect(screen.getByText('Group Pool Active')).toHaveClass('text-teal-300');

      rerender(<Badge variant="provenance">Verified Wholesaler</Badge>);
      expect(screen.getByText('Verified Wholesaler')).toHaveClass('text-cyan-300');
    });
  });

  describe('Dialog.jsx', () => {
    it('opens on trigger click and closes on escape or close button', async () => {
      const user = userEvent.setup();
      render(
        <Dialog>
          <DialogTrigger>Open Modal</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Order Confirmation</DialogTitle>
              <DialogDescription>Review pooled allocation.</DialogDescription>
            </DialogHeader>
            <p>Modal Body Content</p>
          </DialogContent>
        </Dialog>
      );

      expect(screen.queryByText('Modal Body Content')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /open modal/i }));
      expect(screen.getByText('Modal Body Content')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /order confirmation/i })).toBeInTheDocument();

      // Escape key closes modal
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      expect(screen.queryByText('Modal Body Content')).not.toBeInTheDocument();
    });
  });

  describe('Skeleton.jsx', () => {
    it('renders skeleton with animation class', () => {
      render(<Skeleton data-testid="test-skeleton" className="h-6 w-24" />);
      const skeleton = screen.getByTestId('test-skeleton');
      expect(skeleton).toHaveClass('animate-pulse');
      expect(skeleton).toHaveClass('h-6');
      expect(skeleton).toHaveClass('w-24');
    });
  });

  describe('Alert.jsx', () => {
    it('renders alert with info, success, warning, error variants', () => {
      const { rerender } = render(
        <Alert variant="success">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>Pool funded successfully.</AlertDescription>
        </Alert>
      );
      expect(screen.getByRole('alert')).toHaveClass('text-emerald-200');
      expect(screen.getByText('Pool funded successfully.')).toBeInTheDocument();

      rerender(
        <Alert variant="warning">
          <AlertTitle>Decision Required</AlertTitle>
          <AlertDescription>Action needed within 24 hours.</AlertDescription>
        </Alert>
      );
      expect(screen.getByRole('alert')).toHaveClass('text-amber-200');
    });
  });

  describe('Tabs.jsx', () => {
    it('switches tabs properly and renders active content', async () => {
      const user = userEvent.setup();
      render(
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Pools</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
          <TabsContent value="all">Showing All Pools</TabsContent>
          <TabsContent value="active">Showing Active Pools</TabsContent>
          <TabsContent value="completed">Showing Completed Pools</TabsContent>
        </Tabs>
      );

      expect(screen.getByText('Showing All Pools')).toBeInTheDocument();
      expect(screen.queryByText('Showing Active Pools')).not.toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: /active/i }));
      expect(screen.getByText('Showing Active Pools')).toBeInTheDocument();
      expect(screen.queryByText('Showing All Pools')).not.toBeInTheDocument();
    });
  });

  describe('Toast.jsx', () => {
    it('exports Toaster and toast functions', () => {
      expect(Toaster).toBeDefined();
      expect(toast).toBeDefined();
      expect(typeof toast.success).toBe('function');
      expect(typeof toast.error).toBe('function');
    });
  });
});
