// Chrome chung — phải song song 1:1 với catalogs/vi.ts (cùng bộ key).
export const en = {
  nav: {
    home: 'Home',
    cart: 'Cart',
    checkout: 'Checkout',
    account: 'Account',
    admin: 'Admin',
    login: 'Log in',
    register: 'Sign up',
    logout: 'Log out'
  },
  auth: {
    email: 'Email',
    password: 'Password',
    login: 'Log in',
    register: 'Sign up',
    forgot: 'Forgot password?'
  },
  // ── SF-3 checkout (FI-393) — money flow; cart./confirmation./drawer. are
  // NESTED groups of checkout (checkout.cart.* ...) — no other top-level.
  // Mirrors vi 1:1 (same key set); e2e contract pins vi values only ─────────
  checkout: {
    title: 'Checkout',
    stepper: {
      address: 'Address',
      shipping: 'Shipping',
      payment: 'Payment'
    },
    step1: {
      title: 'Shipping address',
      fullName: {
        label: 'Recipient name',
        placeholder: 'Nguyen Van A',
        error: 'Enter the recipient name'
      },
      phone: {
        label: 'Phone number',
        placeholder: '0901234567',
        error: 'Invalid phone number'
      },
      line1: {
        label: 'House number + street',
        placeholder: '12 Nguyen Hue',
        error: 'Enter house number + street'
      },
      ward: {
        label: 'Ward',
        placeholder: 'Ben Nghe',
        error: 'Enter ward'
      },
      district: {
        label: 'District',
        placeholder: 'Quan 1',
        error: 'Enter district'
      },
      city: {
        label: 'Province/City',
        placeholder: 'TP. Ho Chi Minh',
        error: 'Enter province/city'
      }
    },
    continueShipping: 'Continue — choose shipping',
    continuePayment: 'Continue — payment',
    backAddress: '← Back to address',
    backShipping: '← Back to shipping',
    step2: {
      title: 'Shipping method'
    },
    eta: 'Estimated {{days}} days',
    ghnNote: 'GHN fee by address',
    flatNote: 'standard flat fee',
    coupon: {
      title: 'Coupon code',
      label: 'Coupon code',
      apply: 'Apply',
      checking: 'Checking…',
      applied: 'save {{amount}}',
      remove: 'Remove',
      invalid: 'Invalid coupon code'
    },
    points: {
      title: 'Loyalty points',
      label: 'Use points (max {{max}} ≈ {{value}})',
      use: 'Use {{points}} points — save {{amount}}',
      remove: 'Remove',
      none: 'You have 0 points — CONFIRMED orders earn 1% points.',
      noPoints: 'You have no points yet — CONFIRMED orders earn 1% points.',
      notEligible: 'Points cannot be used on this order (merchandise value after discount must be ≥ {{amount}}).'
    },
    payment: {
      title: 'Payment',
      stripe: 'International card (Stripe)',
      cod: 'COD — Cash on delivery'
    },
    codNote: 'Inspect and pay cash on delivery — the order is confirmed immediately.',
    payUnavailable: {
      prefix: 'Order {{id}} was created but the card form could not be mounted (missing VITE_STRIPE_PUBLISHABLE_KEY).',
      ctaLink: 'My orders',
      suffix: 'to pay — unpaid orders are auto-cancelled after 30 minutes.'
    },
    placeOrder: {
      card: 'Review & create order — {{total}}',
      cod: 'Place COD order — {{total}}'
    },
    payingCard: 'Processing card…',
    payByCard: 'Pay by card',
    summary: {
      title: 'Order',
      subtotal: 'Subtotal',
      discount: 'Discount',
      points: 'Loyalty points ({{points}})',
      shipping: 'Shipping fee (standard fee)',
      total: 'Total',
      shipTo: 'Ship to:'
    },
    empty: {
      title: 'Nothing to check out',
      description: 'Go back to your cart to review your order.',
      back: 'Back to cart'
    },
    guestGate: {
      prefix: 'You need to',
      ctaLink: 'log in',
      middle: 'to check out. Your cart is kept after you sign in.'
    },
    noAvailableItems: 'No available items to check out.',
    loadingFee: 'Loading shipping fees…',
    feeLoadFail: 'Could not load shipping fees — go back to the address step.',
    cart: {
      titleCount: 'Cart ({{count}} products)',
      line: {
        removeFromCart: 'Remove',
        total: 'Line total'
      },
      removeConfirm: {
        title: 'Remove item',
        description: 'Remove {{name}} from your cart?',
        cancel: 'Keep',
        confirm: 'Remove'
      },
      summary: {
        title: 'Order summary',
        available: 'Subtotal ({{count}} available products)',
        note: 'Prices shown in the cart are approved — the final total is confirmed at checkout.'
      },
      checkout: 'Checkout',
      empty: {
        title: 'Your cart is empty',
        description: 'Browse the store and add products you like to your cart!',
        home: 'Back to home'
      },
      noAvailable: 'No available products to check out.'
    },
    confirmation: {
      hero: {
        ok: 'Thanks for your purchase!',
        fail: 'Sorry, your order was not completed'
      },
      received: 'Order {{id}} has been recorded.',
      ctaHome: 'Continue shopping',
      myOrders: 'View My orders',
      failedNote: 'The order was not completed — stock and coupon have been released, you can order again.',
      cancelledNote: 'The order was cancelled. If you already paid, the money will be refunded via the payment gateway.',
      emailNote: 'A confirmation email with the PDF invoice has been sent — check the dev mailbox (Mailpit).',
      notFound: {
        title: 'Order not found',
        description: 'The order is no longer on this device (sessionStorage). Your orders live in My orders.'
      },
      status: {
        CONFIRMED: 'Processing',
        SHIPPED: 'Shipping',
        DELIVERED: 'Delivered',
        PENDING: 'Awaiting payment',
        PAID: 'Paid — confirming',
        CANCELLED: 'Cancelled',
        FAILED: 'Failed'
      },
      detail: 'Order detail',
      pollError: 'Could not load the latest status from the system',
      kicker: 'ORDER'
    },
    drawer: {
      title: 'Your cart',
      empty: 'No products in the cart',
      continueShopping: 'Continue shopping',
      viewCart: 'View cart',
      checkout: 'Checkout',
      subtotal: 'Subtotal',
      freeship: 'Free shipping for orders from {{amount}}',
      unavailable: 'No longer available',
      close: 'Close'
    }
  },
  // ── SF-3 shell header (FI-393 T2) — shell header labels ─────────────────
  shell: {
    search: {
      placeholder: 'Search products, brands...',
      submit: 'Search'
    },
    mininav: {
      categories: 'Categories',
      new: 'New arrivals',
      best: 'Best sellers'
    },
    theme: {
      toDark: 'Switch to dark theme',
      toLight: 'Switch to light theme',
      dark: 'Dark',
      light: 'Light'
    },
    cart: {
      aria: 'Cart — {{count}} products'
    }
  },
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search',
    addToCart: 'Add to cart',
    buyNow: 'Buy now'
  },
  common: {
    loading: 'Loading...',
    empty: 'Nothing here yet',
    error: 'Something went wrong',
    retry: 'Retry',
    currency: '₫'
  },
  // ── SF-1 FI-391 — default keys for ui-kit primitives (surfaces pass t('ui.*') into props) — mirrors vi 1:1 ──
  ui: {
    pagination: {
      label: 'Pagination',
      prev: 'Previous page',
      next: 'Next page',
      page: 'Page {{page}}',
      pageOf: 'Page {{page}} of {{total}}'
    },
    breadcrumbs: {
      label: 'You are here:',
      home: 'Home'
    },
    quantityStepper: {
      label: 'Quantity',
      increase: 'Increase quantity',
      decrease: 'Decrease quantity'
    },
    stepper: {
      label: 'Progress',
      step: 'Step {{current}}/{{total}}',
      done: 'Done'
    },
    alert: {
      dismiss: 'Dismiss notification'
    }
  },
  // ── SF-7 mfe-admin (FI-317) — admin chrome, mirrors vi 1:1 ─────────────
  admin: {
    nav: {
      dashboard: 'Dashboard',
      products: 'Products',
      categories: 'Categories',
      coupons: 'Coupons',
      reviews: 'Reviews',
      orders: 'Orders',
      audit: 'Audit log',
      newsletter: 'Newsletter',
      affiliates: 'Affiliates',
      // SF-14 (FI-324) append
      rma: 'Returns',
      loyalty: 'Loyalty'
    },
    newsletter: {
      title: 'Newsletter — subscribers',
      email: 'Email',
      subscribedAt: 'Subscribed at',
      subscribers: 'subscribers',
      empty: 'No subscribers yet'
    },
    audit: {
      title: 'Audit log',
      eventType: 'Event type',
      from: 'From',
      to: 'To',
      apply: 'Filter',
      time: 'Time',
      eventTypeCol: 'Event',
      correlation: 'Correlation ID',
      payload: 'Payload',
      events: 'events',
      empty: 'No events found',
      emptyDesc: 'No events match the filter — try clearing filters and applying again.'
    },
    topbar: {
      viewStorefront: 'View storefront',
      logout: 'Log out'
    },
    common: {
      create: 'Create',
      edit: 'Edit',
      delete: 'Delete',
      save: 'Save',
      cancel: 'Cancel',
      search: 'Search',
      searchPh: 'Search by name/slug...',
      status: 'Status',
      all: 'All',
      actions: 'Actions',
      prev: 'Prev',
      next: 'Next',
      pageOf: 'Page {{page}}/{{total}}',
      total: '{{count}} records',
      mock: 'MOCK',
      confirmDelete: 'Are you sure you want to delete?',
      yes: 'Confirm',
      no: 'Dismiss',
      notFound: 'Page not found',
      retry: 'Retry',
      loadFail: 'Failed to load data',
      saved: 'Saved',
      deleted: 'Deleted',
      error: 'Something went wrong',
      image: 'Image',
      date: 'Date',
      from: 'From date',
      to: 'To date'
    },
    guard: {
      checking: 'Checking permissions...',
      forbiddenTitle: 'No access',
      forbiddenDesc: 'Your account does not have permission to access the admin area.',
      backHome: 'Back to home',
      standaloneGuest: 'Not signed in. Open the admin via the shell (http://localhost:5173) and sign in with an admin account.',
      loginViaShell: 'Sign in via shell'
    },
    status: {
      DRAFT: 'Draft',
      PUBLISHED: 'Published',
      PENDING: 'Pending',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      SUSPENDED: 'Suspended',
      PAID: 'Paid',
      CONFIRMED: 'Confirmed',
      SHIPPED: 'Shipped',
      DELIVERED: 'Delivered',
      CANCELLED: 'Cancelled',
      FAILED: 'Failed',
      // SF-14 (FI-324) — RMA lifecycle append
      REQUESTED: 'Requested',
      RECEIVED: 'Received',
      REFUNDED: 'Refunded'
    },
    products: {
      title: 'Products',
      new: 'New product',
      name: 'Name (vi)',
      nameEn: 'Name (en)',
      slugVi: 'Slug (vi)',
      slugEn: 'Slug (en)',
      slugAuto: 'Auto-generated from name when empty',
      brand: 'Brand',
      category: 'Category',
      official: 'Official store',
      description: 'Description (vi)',
      descriptionEn: 'Description (en)',
      price: 'Price (₫)',
      comparePrice: 'List price (₫)',
      comparePriceWarn: 'List price should be higher than the selling price',
      flashEndsAt: 'Flash sale ends at',
      tabInfo: 'Info',
      tabSeo: 'SEO',
      tabPrice: 'Pricing',
      tabVariants: 'Variants',
      tabImages: 'Images',
      seoTitle: 'SEO title',
      seoDesc: 'SEO description',
      seoTitlePh: 'Leave empty → use product name',
      seoDescPh: 'Leave empty → first 160 chars of description',
      variants: 'Variants',
      addVariant: 'Add variant',
      removeVariant: 'Remove row',
      variantName: 'Attribute name (vi)',
      variantNameEn: 'Attribute name (en)',
      options: 'Options',
      optionsPh: 'color=red, size=XL',
      optionsInvalid: 'Invalid format — use key=value, separated by commas',
      priceDelta: 'Price delta (₫)',
      stock: 'Stock',
      images: 'Product images',
      imageUrl: 'Image URL',
      imageAlt: 'Alt text',
      exportCsv: 'Export CSV',
      addImage: 'Add image',
      uploadImage: 'Upload image',
      uploadingImage: 'Uploading…',
      imageUploaded: 'Image uploaded',
      moveUp: 'Up',
      moveDown: 'Down',
      publish: 'Publish',
      draft: 'Save draft',
      created: 'Product created',
      updated: 'Product updated',
      seeStorefront: 'View on storefront',
      seeStorefrontEn: 'English version',
      deactivate: 'Deactivate',
      deactivateConfirm: 'Deactivate this product? It will be hidden from the storefront.',
      deactivated: 'Product deactivated',
      empty: 'No products yet',
      variantTotal: '{{count}} variants',
      subTabVi: 'Vietnamese',
      subTabEn: 'English (empty → Vietnamese)'
    },
    categories: {
      title: 'Categories',
      new: 'New category',
      edit: 'Edit category',
      name: 'Name (vi)',
      nameEn: 'Name (en)',
      slugVi: 'Slug (vi)',
      slugEn: 'Slug (en)',
      parent: 'Parent category',
      parentRoot: '— Root category —',
      deleteBlocked: 'Cannot delete: category still has products or child categories',
      created: 'Category created',
      updated: 'Category updated',
      deleted: 'Category deleted',
      empty: 'No categories yet'
    },
    coupons: {
      title: 'Coupons',
      new: 'New coupon',
      edit: 'Edit coupon',
      code: 'Code',
      type: 'Type',
      percent: 'Percent (%)',
      fixed: 'Fixed amount (₫)',
      value: 'Value',
      minOrder: 'Min order (₫)',
      startsAt: 'Starts at',
      endsAt: 'Ends at',
      usage: 'Usage',
      usageOf: '{{used}}/{{limit}}',
      active: 'Active',
      description: 'Description',
      created: 'Coupon created',
      updated: 'Coupon updated',
      toggled: 'Coupon status toggled',
      empty: 'No coupons yet',
      inactive: 'Off',
      deleteBlocked: 'Cannot delete coupon',
      codeLocked: 'Code is immutable when editing',
      errCode: 'Code: 1-64 chars [A-Za-z0-9_-]',
      errValue: 'Invalid value (PERCENT 1-100, FIXED > 0)',
      errMinOrder: 'Min order must be ≥ 0',
      errWindow: 'Ends at must be after starts at',
      errLimit: 'Usage limit must be ≥ 1 (empty = unlimited)'
    },
    affiliates: {
      title: 'Affiliates',
      colCode: 'Ref code',
      colRate: 'Commission (%)',
      colClicks: 'Clicks',
      colConversions: 'Conversions',
      colEarnings: 'Commission',
      statTotal: 'Total profiles',
      statClicks: 'Clicks',
      statConversions: 'Conversions',
      statCommission: 'Total commission',
      approve: 'Approve',
      approveDone: 'Approved — ref code generated',
      reject: 'Reject',
      rejectDone: 'Rejected',
      suspend: 'Suspend',
      suspendDone: 'Suspended — link stops tracking',
      reactivate: 'Reactivate',
      reactivateDone: 'Reactivated',
      rateEditHint: 'Click to change rate (applies to future orders)',
      rateInvalid: 'Rate must be within (0, 50]',
      empty: 'No affiliate profiles yet'
    },
    // ── SF-14 (FI-324) — RMA + loyalty append ───────────────────────────────
    rma: {
      title: 'Return requests',
      colId: 'RMA ID',
      colOrder: 'Order',
      colReason: 'Reason',
      colItems: 'Items returned',
      approve: 'Approve',
      approveDone: 'Return request approved',
      reject: 'Reject',
      rejectDone: 'Request rejected',
      markReceived: 'Mark received',
      markReceivedDone: 'Return received',
      refund: 'Refund',
      refundDone: 'Refunded',
      empty: 'No return requests'
    },
    loyalty: {
      title: 'Loyalty points',
      lookupTitle: 'Customer lookup',
      lookupPh: 'Enter user id (uuid)',
      lookup: 'Look up',
      balance: 'Current points',
      totalEarned: 'Total earned',
      ledger: 'Points ledger',
      adjustTitle: 'Manual adjust',
      adjustPoints: 'Points (+/-)',
      adjustNote: 'Note',
      adjust: 'Apply',
      adjustDone: 'Points adjusted',
      empty: 'Enter a user id to look up',
      notFound: 'No data — check the user id'
    },
    reviews: {
      title: 'Review moderation',
      product: 'Product',
      user: 'User',
      rating: 'Rating',
      content: 'Content',
      verified: 'Verified purchase',
      approve: 'Approve',
      reject: 'Reject',
      approved: 'Review approved',
      rejected: 'Review rejected',
      empty: 'No reviews pending moderation'
    },
    orders: {
      title: 'Orders',
      exportCsv: 'Export CSV',
      order: 'Order',
      customer: 'Customer',
      items: 'Items',
      itemsCount: 'Qty',
      total: 'Total',
      payment: 'Payment',
      paymentStripe: 'Stripe',
      paymentCod: 'COD',
      detail: 'Order detail',
      address: 'Shipping address',
      timeline: 'Order timeline',
      invoice: 'Download invoice',
      invoiceDone: 'Invoice downloaded (demo)',
      ship: 'Ship',
      deliver: 'Mark delivered',
      cancel: 'Cancel order',
      cancelConfirm: 'Cancel this order?',
      shipped: 'Order marked as shipped',
      delivered: 'Order marked as delivered',
      cancelled: 'Order cancelled',
      invalidTransition: 'Cannot transition this order',
      couponCode: 'Coupon',
      affiliateCode: 'Affiliate code',
      empty: 'No orders yet',
      phone: 'Phone',
      subtotal: 'Subtotal',
      shipping: 'Shipping'
    },
    dashboard: {
      title: 'Dashboard',
      revenueToday: 'Revenue today',
      revenue7d: 'Revenue 7 days',
      ordersToday: 'Orders today',
      aov: 'Avg order value (AOV)',
      revenueChart: 'Revenue by day (14 days)',
      topChart: 'Top products',
      lowStock: 'Low stock',
      lowStockEmpty: 'No products are low on stock',
      lowStockFail: 'Failed to load low stock',
      product: 'Product',
      variant: 'Variant',
      available: 'Available',
      threshold: 'Threshold',
      revenue: 'Revenue',
      ordersCol: 'Orders',
      qty: 'Quantity'
    }
  }
};
