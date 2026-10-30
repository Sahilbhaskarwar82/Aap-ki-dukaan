import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LandingPage } from '@/pages/public/LandingPage';

describe('HIM-03: Marketplace Landing Page', () => {
  it('renders marketplace navigation, branding, search bar and hero banner', () => {
    render(<LandingPage />);

    // Brand and subtitle (header and footer)
    expect(screen.getAllByText('Aap Ki Dukan').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('CoBuy AI').length).toBeGreaterThanOrEqual(1);

    // Delivery location
    expect(screen.getByText('Lucknow 226001')).toBeInTheDocument();

    // Hero title
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /WHOLESALE PRICES/i
    );

    // CTAs
    expect(
      screen.getByRole('button', { name: /explore active group buys/i })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /how.*works/i })[0]
    ).toBeInTheDocument();
  });

  it('renders shop by category items', () => {
    render(<LandingPage />);
    expect(screen.getAllByText('Packaging & Disposables').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cooking Oils & Ghee').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bulk Grains & Pulses').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Commercial Cleaning').length).toBeGreaterThanOrEqual(1);
  });

  it('renders trending group-buy cards with progress bars and supplier info', () => {
    render(<LandingPage />);
    expect(
      screen.getAllByText(/12oz Eco Kraft Paper Cups/i).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Apex Packaging Ltd/i).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/850 \/ 1,000 cartons/i)).toBeInTheDocument();

    // Action button to join
    const joinButtons = screen.getAllByRole('button', {
      name: /join group buy pool/i,
    });
    expect(joinButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('opens and interacts with the Join Group Buy modal', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    const joinBtn = screen.getAllByRole('button', {
      name: /join group buy pool/i,
    })[0];
    await user.click(joinBtn);

    // Modal opens
    expect(
      screen.getByRole('heading', { name: /join group buy pool/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/pay at join/i)).toBeInTheDocument();

    // Cancel modal
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /join group buy pool/i })
      ).not.toBeInTheDocument();
    });
  });

  it('renders the interactive ₹4,800 pricing calculator with exact mathematical correctness', async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    // Open How It Works modal
    const howItWorksBtn = screen.getAllByRole('button', {
      name: /how.*works/i,
    })[0];
    await user.click(howItWorksBtn);

    // Wait for modal content
    expect(
      screen.getByText(/CoBuy AI Engine: Collective Buying Architecture/i)
    ).toBeInTheDocument();

    // Verify default calculator values:
    // Shop A: 20 boxes = ₹1,600
    // Shop B: 15 boxes = ₹1,200
    // Shop C: 25 boxes = ₹2,000
    // Total volume: 60 Boxes
    // Rate: ₹80/box (Tier 3 unlocked)
    // Group Merchandise Total: ₹4,800
    expect(screen.getByText('20 boxes')).toBeInTheDocument();
    expect(screen.getByText('15 boxes')).toBeInTheDocument();
    expect(screen.getByText('25 boxes')).toBeInTheDocument();
    expect(screen.getByText('₹1,600')).toBeInTheDocument();
    expect(screen.getByText('₹1,200')).toBeInTheDocument();
    expect(screen.getByText('₹2,000')).toBeInTheDocument();
    expect(screen.getByText('60 Boxes')).toBeInTheDocument();
    expect(screen.getByText('₹4,800')).toBeInTheDocument();

    // Verify Two-Level MOQ Engine tab
    const moqTab = screen.getByRole('tab', { name: /two-level moq engine/i });
    await user.click(moqTab);
    expect(screen.getByText('1,000 units')).toBeInTheDocument();
    expect(screen.getByText(/200 units \(20%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/10 units \(1%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/200 units • Valid/i)).toBeInTheDocument();

    // Verify AI Extraction tab
    const aiTab = screen.getByRole('tab', { name: /ai extraction demo/i });
    await user.click(aiTab);
    expect(
      screen.getByText(
        /"We need 25 boxes of 12-ounce food-safe paper cups for our café."/i
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('Paper Cups').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('25 boxes').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('12 oz')).toBeInTheDocument();

    // Verify Timeline tab
    const timelineTab = screen.getByRole('tab', { name: /72h pool timeline/i });
    await user.click(timelineTab);
    expect(
      screen.getByText(/Stage 1: Pool Opens/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Stage 2: Early Lock on MOQ/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Stage 4: 24h Buyer Decision Window/i)
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Silence is never consent/i).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders verified wholesale suppliers section and direct catalog', () => {
    render(<LandingPage />);
    expect(
      screen.getByText(/Verified Regional Wholesalers & Distributors/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Apex Packaging Ltd').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bharat Agro Mills').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Direct Wholesale Catalog')).toBeInTheDocument();
  });
});
