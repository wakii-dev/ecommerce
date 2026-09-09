// Chrome chung toàn story (D17) — KHÔNG chứa label nghiệp vụ từng domain
// (labels domain sống ở catalogs của SF đó, thêm vào đây chỉ khi dùng chung).
export const vi = {
  nav: {
    home: 'Trang chủ',
    cart: 'Giỏ hàng',
    checkout: 'Thanh toán',
    account: 'Tài khoản',
    admin: 'Quản trị',
    login: 'Đăng nhập',
    register: 'Đăng ký',
    logout: 'Đăng xuất'
  },
  // ── SF-4 FI-394 — account surface (anchor: sau nav — merge sạch với SF-3/SF-5) ──
  account: {
    nav: {
      label: 'Điều hướng tài khoản',
      account: 'Tài khoản',
      orders: 'Đơn hàng',
      wishlist: 'Sản phẩm yêu thích',
      reviews: 'Đánh giá của tôi',
      affiliate: 'Affiliate',
      loyalty: 'Điểm thưởng'
    },
    // ── T2 — auth flows (chuỗi vi GIỮ NGUYÊN text đang có — e2e locate theo text) ──
    auth: {
      loginTitle: 'Đăng nhập',
      registerTitle: 'Đăng ký',
      forgotTitle: 'Quên mật khẩu',
      resetTitle: 'Đặt lại mật khẩu',
      twofaTitle: 'Xác thực hai lớp',
      email: 'Email',
      password: 'Mật khẩu',
      fullName: 'Họ tên',
      newPassword: 'Mật khẩu mới',
      code: 'Mã xác thực',
      phEmail: 'ban@example.com',
      phPassword: '••••••••',
      phFullName: 'Nguyen Van A',
      phPasswordRegister: 'Tối thiểu 8 ký tự',
      phCode: '123456 hoặc mã dự phòng',
      errInvalidEmail: 'Email không hợp lệ',
      errPasswordMin8: 'Mật khẩu tối thiểu 8 ký tự',
      errFullNameRequired: 'Vui lòng nhập họ tên',
      errCodeInvalid: 'Nhập mã 6 số (app authenticator) hoặc mã dự phòng',
      login: 'Đăng nhập',
      register: 'Đăng ký',
      sendResetLink: 'Gửi link đặt lại mật khẩu',
      resetPassword: 'Đặt lại mật khẩu',
      confirm: 'Xác nhận',
      noAccount: 'Chưa có tài khoản?',
      haveAccount: 'Đã có tài khoản?',
      backToLogin: 'Về trang đăng nhập',
      loginWithNewPassword: 'Đăng nhập bằng mật khẩu mới',
      forgotSent: 'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi link đặt lại mật khẩu. Kiểm tra hộp thư (kể cả Spam).',
      resetSuccess: 'Đổi mật khẩu thành công! Mọi phiên đăng nhập cũ đã bị đăng xuất.',
      resetMissingToken: 'Thiếu token đặt lại mật khẩu. Hãy mở link trong email chúng tôi đã gửi.',
      showPassword: 'Hiện mật khẩu',
      hidePassword: 'Ẩn mật khẩu',
      errGeneric: 'Có lỗi xảy ra — thử lại',
      errEmailTaken: 'Email đã tồn tại',
      errTokenInvalid: 'Token không hợp lệ hoặc đã hết hạn',
      errTwofaFailed: 'Xác thực không thành công — thử lại'
    },
    // ── T2 — OAuth callback messages ──
    oauth: {
      or: 'hoặc',
      google: 'Đăng nhập với Google',
      facebook: 'Đăng nhập với Facebook',
      completing: 'Đang hoàn tất đăng nhập…',
      failedTitle: 'Đăng nhập không thành công',
      accessDenied: 'Bạn đã từ chối cấp quyền đăng nhập.',
      stateMismatch: 'Phiên đăng nhập không hợp lệ — thử lại từ đầu.',
      noEmail: 'Tài khoản mạng xã hội chưa xác thực email — dùng cách đăng nhập khác.',
      missingCode: 'Thiếu mã đăng nhập từ nhà cung cấp.',
      providerError: 'Nhà cung cấp đăng nhập gặp lỗi — thử lại.',
      genericError: 'Đăng nhập không thành công.',
      exchangeError: 'Không hoàn tất được đăng nhập — thử lại.'
    },
    // ── T3 — UserMenu (chuỗi vi GIỮ NGUYÊN text đang có — e2e locate theo text;
    // GuestLinks REUSE nav.login/nav.register) ──
    menu: {
      account: 'Tài khoản',
      orders: 'Đơn hàng của tôi',
      logout: 'Đăng xuất',
      displayNameFallback: 'Tài khoản'
    },
    // ── T4 — profile form + 2FA (chuỗi vi GIỮ NGUYÊN text đang có) ──
    profile: {
      title: 'Tài khoản',
      personalInfo: 'Thông tin cá nhân',
      email: 'Email',
      role: 'Vai trò',
      fullName: 'Họ tên',
      phone: 'Số điện thoại',
      phonePlaceholder: '0901234567',
      phoneInvalid: 'Số điện thoại không hợp lệ',
      fullNameRequired: 'Vui lòng nhập họ tên',
      save: 'Lưu',
      saved: 'Đã lưu',
      roleCustomer: 'Khách hàng',
      roleAdmin: 'Quản trị',
      errorGeneric: 'Có lỗi xảy ra — thử lại'
    },
    twofa: {
      title: 'Bảo mật hai lớp',
      enabled: 'Đang bật',
      disabled: 'Đang tắt',
      enable: 'Bật 2FA',
      disable: 'Tắt 2FA',
      noteIdle: 'Chống truy cập trái phép — mỗi lần đăng nhập sẽ hỏi mã từ app authenticator.',
      noteQr: 'Quét mã bằng Google Authenticator / Authy, rồi nhập mã 6 số hiện tại.',
      noteCodes: 'Lưu lại mã dự phòng — mỗi mã dùng được 1 lần khi mất điện thoại. Không hiện lại lần nữa.',
      codeLabel: 'Mã 6 số trong app',
      activate: 'Kích hoạt',
      codesSaved: 'Tôi đã lưu mã dự phòng',
      disableNote: 'Cần mật khẩu + một mã 2FA (app hoặc mã dự phòng) để tắt.',
      disablePassword: 'Mật khẩu',
      disableCode: 'Mã 2FA',
      confirmDisable: 'Xác nhận tắt',
      cancel: 'Hủy',
      qrAlt: 'Mã QR đăng ký 2FA'
    },
    // ── T5 — OrdersPage (chuỗi vi GIỮ NGUYÊN text đang có — e2e locate theo text) ──
    orders: {
      title: 'Đơn hàng của tôi',
      orderId: 'Đơn #{{id}}',
      itemsCount: '{{count}} sản phẩm',
      itemsCount_one: '{{count}} sản phẩm',
      loading: 'Đang tải đơn hàng…',
      emptyTitle: 'Bạn chưa có đơn hàng nào',
      emptyDesc: 'Khám phá hàng ngàn sản phẩm đang khuyến mãi hot.',
      emptyCta: 'Tiếp tục mua sắm',
      errorTitle: 'Không tải được đơn hàng',
      retry: 'Thử lại',
      paymentStripe: 'Stripe',
      paymentCod: 'COD'
    },
    // ── T6 — OrderDetail (chuỗi vi GIỮ NGUYÊN text đang có — e2e locate theo
    // testid: order-detail/tracking-block/rma-create/rma-submit/rma-list/points-discount) ──
    order: {
      title: 'Đơn #{{id}}',
      backToList: 'Về danh sách đơn',
      notFound: 'Không tìm thấy đơn hàng',
      errorGeneric: 'Có lỗi xảy ra',
      loading: 'Đang tải đơn hàng…',
      orderedAt: 'Đặt lúc {{at}}',
      payment: 'Thanh toán',
      shipping: 'Vận chuyển',
      shippingStd: 'Giao hàng tiêu chuẩn',
      shippingExpress: 'Giao hàng nhanh',
      trackingCode: 'Mã vận đơn',
      trackingCarrierFlat: 'Giao hàng tiêu chuẩn',
      carrierLabel: 'Đơn vị',
      statusLabel: 'Trạng thái',
      trackingStatusDelivered: 'Đã giao',
      trackingStatusTransit: 'Đang vận chuyển',
      trackingStatusPreparing: 'Đang chuẩn bị',
      noTracking: 'Chưa có mã vận đơn — hiển thị sau khi shop đóng gói.',
      invoice: 'Tải hóa đơn PDF',
      invoiceFail: 'Tải hóa đơn thất bại',
      invoiceError: 'Tải hóa đơn lỗi (HTTP {{status}})',
      rmaCreate: 'Trả hàng / hoàn tiền',
      cancel: 'Hủy đơn',
      cancelSuccess: 'Đã hủy đơn — tồn kho và mã giảm giá (nếu có) sẽ được hoàn lại.',
      cancelFail: 'Hủy đơn thất bại',
      cancelModalTitle: 'Hủy đơn hàng?',
      cancelModalBody: 'Đơn #{{id}} chưa được thanh toán. Hủy xong tồn kho sẽ được nhả lại và bạn không thể hoàn tác.',
      keepOrder: 'Giữ đơn',
      confirmCancel: 'Hủy đơn',
      cancelling: 'Đang hủy…',
      items: 'Sản phẩm',
      qty: 'SL',
      lineTotal: 'Thành tiền',
      subtotal: 'Tạm tính',
      discount: 'Giảm giá',
      pointsDiscount: 'Điểm thưởng',
      shippingFee: 'Phí vận chuyển',
      total: 'Tổng cộng',
      address: 'Địa chỉ nhận hàng',
      shippingSection: 'Vận chuyển',
      timeline: 'Tiến trình đơn hàng',
      rmaSection: 'Yêu cầu trả hàng',
      rmaSummary: '{{count}} món',
      rmaSummary_one: '{{count}} món',
      refund: 'hoàn {{amount}}',
      rmaSuccess: 'Đã gửi yêu cầu trả hàng — chờ quản trị viên duyệt. Xem tiến trình bên dưới.',
      rmaFail: 'Không tạo được yêu cầu trả hàng',
      rmaModalTitle: 'Tạo yêu cầu trả hàng',
      rmaQty: 'Số lượng trả {{name}}',
      rmaReason: 'Lý do trả hàng',
      rmaReasonPlaceholder: 'Lý do trả hàng (sai mẫu, lỗi sản phẩm…) — trong 7 ngày kể từ khi nhận hàng',
      rmaCount: '{{count}}/500',
      rmaCount_one: '{{count}}/500',
      rmaErrorEmpty: 'Chọn ít nhất 1 sản phẩm muốn trả',
      rmaErrorReason: 'Nhập lý do trả hàng',
      rmaSubmit: 'Gửi yêu cầu',
      rmaSubmitting: 'Đang gửi…',
      close: 'Đóng',
      status: {
        pending: 'Chờ thanh toán',
        paid: 'Đã thanh toán',
        confirmed: 'Đã xác nhận',
        shipped: 'Đang giao',
        delivered: 'Đã giao',
        cancelled: 'Đã hủy',
        failed: 'Thất bại'
      },
      rmaStatus: {
        requested: 'Chờ xử lý',
        approved: 'Đã duyệt',
        received: 'Đã nhận hàng',
        refunded: 'Đã hoàn tiền',
        rejected: 'Bị từ chối'
      }
    },
    // ── T7 — Wishlist (chuỗi vi GIỮ text đang có — e2e locate theo text;
    // confirm modal + skeleton + empty thêm mới) ──
    wishlist: {
      title: 'Sản phẩm yêu thích',
      emptyTitle: 'Chưa có sản phẩm yêu thích',
      emptyDesc: 'Nhấn trái tim trên sản phẩm để lưu vào đây.',
      delete: 'Xóa',
      deleteConfirmTitle: 'Xóa sản phẩm yêu thích?',
      deleteConfirmDesc: '“{{name}}” sẽ bị xóa khỏi danh sách yêu thích.',
      cancel: 'Hủy',
      deleting: 'Đang xóa…',
      errorLoad: 'Không tải được wishlist',
      errorRemove: 'Xóa thất bại — thử lại'
    },
    // ── T8 — my reviews (badge label = key, resolve lúc render) ──
    reviews: {
      title: 'Đánh giá của tôi',
      statusPending: 'Chờ duyệt',
      statusApproved: 'Đã duyệt',
      statusRejected: 'Bị từ chối',
      verified: 'Mua đã xác nhận',
      emptyTitle: 'Bạn chưa viết đánh giá nào',
      emptyDesc: 'Vào trang sản phẩm để viết đánh giá đầu tiên.',
      loading: 'Đang tải đánh giá…',
      errorLoad: 'Không tải được đánh giá của bạn',
      productFallback: 'Sản phẩm'
    },
    // ── T9 — affiliate + loyalty (chuỗi vi GIỮ NGUYÊN text đang có; status
    // ledger render RAW enum — không key status) ──
    affiliate: {
      title: 'Affiliate',
      registerTitle: 'Đăng ký làm cộng tác viên (affiliate)',
      registerDesc: 'Nhận link giới thiệu riêng — hoa hồng 5%/đơn (đổi theo quyết định của admin) cho mỗi đơn phát sinh từ link của bạn.',
      portfolioLabel: 'Link kênh giới thiệu (blog/social)',
      portfolioPlaceholder: 'https://youtube.com/@kenh-cua-ban',
      noteLabel: 'Giới thiệu ngắn',
      notePlaceholder: 'Bạn sẽ quảng bá qua kênh nào?',
      submit: 'Gửi hồ sơ',
      pendingTitle: 'Hồ sơ đã gửi — chờ duyệt',
      pendingDesc: 'Admin sẽ duyệt hồ sơ của bạn. Khi được duyệt bạn nhận ref code + link giới thiệu riêng tại trang này.',
      suspendedTitle: 'Tài khoản affiliate tạm ngưng',
      suspendedDesc: 'Link giới thiệu của bạn hiện không được theo dõi. Liên hệ admin để biết thêm chi tiết.',
      rejectedRetry: 'Hồ sơ trước bị từ chối — bạn có thể đăng ký lại',
      statsClicks: 'Clicks',
      statsConversions: 'Conversions',
      statsEarnings: 'Hoa hồng',
      refCode: 'Ref code của bạn',
      rateBadge: 'hoa hồng {{rate}}%',
      linkTitle: 'Tạo link giới thiệu',
      linkLabel: 'Link sản phẩm hoặc trang bất kỳ',
      copyLink: 'Copy link',
      copied: 'Đã copy!',
      ledger: 'Sổ hoa hồng',
      ledgerEmpty: 'Chưa có hoa hồng nào — chia sẻ link và chờ đơn đầu tiên (hiện khi đơn được xác nhận).',
      colOrder: 'Đơn',
      colValue: 'Giá trị',
      colRate: 'Rate',
      colCommission: 'Hoa hồng',
      colStatus: 'Trạng thái',
      errorLoad: 'Không tải được hồ sơ affiliate',
      errorSubmit: 'Không gửi được hồ sơ — thử lại'
    },
    loyalty: {
      title: 'Điểm thưởng',
      balance: 'Điểm hiện có',
      totalEarned: 'Tổng đã nhận',
      convert: 'Quy đổi khi mua hàng',
      convertRate: '≈ {{amount}} (1 điểm = 100đ)',
      loading: 'Đang tải điểm thưởng…',
      errorLoad: 'Không tải được điểm thưởng — thử tải lại trang.',
      points: 'điểm'
    }
  },
  auth: {
    email: 'Email',
    password: 'Mật khẩu',
    login: 'Đăng nhập',
    register: 'Đăng ký',
    forgot: 'Quên mật khẩu?'
  },
  // ── SF-3 checkout (FI-393) — luồng tiền; cart./confirmation./drawer. là
  // group CON của checkout (checkout.cart.* ...) — KHÔNG top-level khác.
  // vi value = chuẩn e2e (labels nút/bước giữ NGUYÊN CHỮ) ──────────────────
  checkout: {
    title: 'Thanh toán',
    stepper: {
      label: 'Các bước thanh toán',
      address: 'Địa chỉ',
      shipping: 'Vận chuyển',
      payment: 'Thanh toán'
    },
    step1: {
      title: 'Địa chỉ nhận hàng',
      fullName: {
        label: 'Họ tên người nhận',
        placeholder: 'Nguyen Van A',
        error: 'Nhập họ tên người nhận'
      },
      phone: {
        label: 'Số điện thoại',
        placeholder: '0901234567',
        error: 'Số điện thoại không hợp lệ'
      },
      line1: {
        label: 'Số nhà + đường',
        placeholder: '12 Nguyen Hue',
        error: 'Nhập số nhà + tên đường'
      },
      ward: {
        label: 'Phường/xã',
        placeholder: 'Ben Nghe',
        error: 'Nhập phường/xã'
      },
      district: {
        label: 'Quận/huyện',
        placeholder: 'Quan 1',
        error: 'Nhập quận/huyện'
      },
      city: {
        label: 'Tỉnh/thành phố',
        placeholder: 'TP. Hồ Chí Minh',
        error: 'Nhập tỉnh/thành phố'
      }
    },
    continueShipping: 'Tiếp tục — chọn vận chuyển',
    continuePayment: 'Tiếp tục — thanh toán',
    backAddress: '← Quay lại địa chỉ',
    backShipping: '← Quay lại vận chuyển',
    step2: {
      title: 'Phương thức vận chuyển'
    },
    eta: 'Dự kiến {{days}} ngày',
    ghnNote: 'phí GHN theo địa chỉ',
    flatNote: 'phí tiêu chuẩn (flat-fee)',
    coupon: {
      title: 'Mã giảm giá',
      label: 'Mã giảm giá',
      apply: 'Áp dụng',
      checking: 'Đang kiểm tra…',
      applied: 'giảm {{amount}}',
      remove: 'Gỡ',
      invalid: 'Mã không hợp lệ'
    },
    points: {
      title: 'Điểm thưởng',
      label: 'Dùng điểm (tối đa {{max}} ≈ {{value}})',
      balance: 'Bạn có {{points}} điểm',
      use: 'Dùng {{points}} điểm — giảm {{amount}}',
      remove: 'Gỡ',
      none: 'Bạn có 0 điểm — mua hàng CONFIRMED sẽ nhận 1% điểm.',
      noPoints: 'Bạn chưa có điểm — mua hàng CONFIRMED sẽ nhận 1% điểm.',
      notEligible: 'Đơn hiện tại chưa dùng được điểm (giá trị hàng sau giảm giá phải ≥ {{amount}}).'
    },
    payment: {
      title: 'Thanh toán',
      stripe: 'Thẻ quốc tế (Stripe)',
      cod: 'COD — Thanh toán khi nhận hàng'
    },
    codNote: 'Kiểm tra hàng và thanh toán tiền mặt khi nhận — đơn được xác nhận ngay.',
    payUnavailable: {
      prefix: 'Đơn {{id}} đã tạo nhưng chưa mount được form thẻ (thiếu VITE_STRIPE_PUBLISHABLE_KEY).',
      ctaLink: 'Đơn hàng của tôi',
      suffix: 'để thanh toán — đơn chưa trả sẽ tự hủy sau 30 phút.'
    },
    placeOrder: {
      card: 'Kiểm tra & tạo đơn — {{total}}',
      cod: 'Đặt hàng COD — {{total}}'
    },
    payingCard: 'Đang xử lý thẻ…',
    payByCard: 'Thanh toán bằng thẻ',
    summary: {
      title: 'Đơn hàng',
      subtotal: 'Tạm tính',
      discount: 'Giảm giá',
      points: 'Điểm thưởng ({{points}})',
      shipping: 'Phí vận chuyển (phí tiêu chuẩn)',
      total: 'Tổng cộng',
      shipTo: 'Địa chỉ:'
    },
    empty: {
      title: 'Chưa có sản phẩm để thanh toán',
      description: 'Quay lại giỏ hàng để kiểm tra lại đơn của bạn.',
      back: 'Về giỏ hàng'
    },
    guestGate: {
      prefix: 'Bạn cần',
      ctaLink: 'đăng nhập',
      middle: 'để thanh toán. Giỏ hàng của bạn vẫn được giữ lại sau khi đăng nhập.'
    },
    noAvailableItems: 'Không có sản phẩm khả dụng để thanh toán.',
    loadingFee: 'Đang tải phí vận chuyển…',
    feeLoadFail: 'Không tải được phí vận chuyển — thử quay lại bước địa chỉ.',
    cart: {
      titleCount: 'Giỏ hàng ({{count}} sản phẩm)',
      line: {
        removeFromCart: 'Xóa',
        total: 'Thành tiền'
      },
      removeConfirm: {
        title: 'Xóa sản phẩm',
        description: 'Bỏ {{name}} khỏi giỏ?',
        cancel: 'Giữ lại',
        confirm: 'Xóa'
      },
      summary: {
        title: 'Thông tin đơn hàng',
        available: 'Tạm tính ({{count}} sản phẩm khả dụng)',
        note: 'Giá hiển thị trong giỏ là duyệt — tổng cuối cùng được xác nhận lúc đặt hàng.'
      },
      checkout: 'Thanh toán',
      empty: {
        title: 'Giỏ hàng trống',
        description: 'Duyệt cửa hàng và thêm sản phẩm bạn thích vào giỏ nhé!',
        home: 'Về trang chủ'
      },
      noAvailable: 'Không có sản phẩm khả dụng để thanh toán.'
    },
    confirmation: {
      hero: {
        ok: 'Cảm ơn bạn đã mua hàng!',
        fail: 'Rất tiếc, đơn hàng chưa thành công'
      },
      received: 'Đơn hàng {{id}} đã được ghi nhận.',
      ctaHome: 'Tiếp tục mua sắm',
      myOrders: 'Xem Đơn hàng của tôi',
      failedNote: 'Đơn không hoàn tất — kho và mã giảm giá đã được trả lại, bạn có thể đặt hàng lại.',
      cancelledNote: 'Đơn đã bị hủy. Nếu bạn đã thanh toán, tiền sẽ được hoàn qua cổng thanh toán.',
      emailNote: 'Email xác nhận đã được gửi kèm hóa đơn PDF — kiểm tra hộp thư dev (Mailpit).',
      notFound: {
        title: 'Không tìm thấy đơn hàng',
        description: 'Đơn vừa đặt không còn trên máy này (sessionStorage). Đơn của bạn nằm trong mục Đơn hàng của tôi.'
      },
      status: {
        CONFIRMED: 'Đang xử lý',
        SHIPPED: 'Đang giao',
        DELIVERED: 'Đã giao',
        PENDING: 'Chờ thanh toán',
        PAID: 'Đã thanh toán — đang xác nhận',
        CANCELLED: 'Đã hủy',
        FAILED: 'Thất bại'
      },
      detail: 'Chi tiết đơn',
      pollError: 'Không tải được trạng thái mới nhất từ hệ thống',
      kicker: 'ĐƠN HÀNG'
    },
    drawer: {
      title: 'Giỏ hàng của bạn',
      empty: 'Chưa có sản phẩm trong giỏ',
      continueShopping: 'Tiếp tục mua sắm',
      viewCart: 'Xem giỏ hàng',
      checkout: 'Thanh toán',
      subtotal: 'Tạm tính',
      freeship: 'Miễn phí vận chuyển cho đơn từ {{amount}}',
      unavailable: 'Không còn khả dụng',
      close: 'Đóng'
    }
  },
  // ── SF-3 shell header (FI-393 T2) — labels header shell ─────────────────
  shell: {
    search: {
      placeholder: 'Tìm sản phẩm, thương hiệu...',
      submit: 'Tìm kiếm'
    },
    mininav: {
      categories: 'Danh mục',
      new: 'Hàng mới',
      best: 'Bán chạy'
    },
    theme: {
      toDark: 'Chuyển giao diện tối',
      toLight: 'Chuyển giao diện sáng',
      dark: 'Tối',
      light: 'Sáng'
    },
    cart: {
      aria: 'Giỏ hàng — {{count}} sản phẩm'
    }
  },
  actions: {
    save: 'Lưu',
    cancel: 'Hủy',
    delete: 'Xóa',
    edit: 'Sửa',
    search: 'Tìm kiếm',
    addToCart: 'Thêm vào giỏ',
    buyNow: 'Mua ngay'
  },
  common: {
    loading: 'Đang tải...',
    empty: 'Chưa có gì ở đây',
    error: 'Có lỗi xảy ra',
    retry: 'Thử lại',
    currency: '₫'
  },
  // ── SF-1 FI-391 — keys mặc định primitives ui-kit (surfaces truyền t('ui.*') vào props) ──
  ui: {
    pagination: {
      label: 'Phân trang',
      prev: 'Trang trước',
      next: 'Trang sau',
      page: 'Trang {{page}}',
      pageOf: 'Trang {{page}}/{{total}}'
    },
    breadcrumbs: {
      label: 'Bạn đang ở:',
      home: 'Trang chủ'
    },
    quantityStepper: {
      label: 'Số lượng',
      increase: 'Tăng số lượng',
      decrease: 'Giảm số lượng'
    },
    stepper: {
      label: 'Tiến trình',
      step: 'Bước {{current}}/{{total}}',
      done: 'Hoàn thành'
    },
    alert: {
      dismiss: 'Đóng thông báo'
    }
  },
  // ── SF-7 mfe-admin (FI-317) — labels khu vực quản trị ──────────────────
  admin: {
    nav: {
      dashboard: 'Tổng quan',
      products: 'Sản phẩm',
      categories: 'Danh mục',
      coupons: 'Mã giảm giá',
      reviews: 'Đánh giá',
      orders: 'Đơn hàng',
      affiliates: 'Affiliate',
      audit: 'Nhật ký hệ thống',
      newsletter: 'Newsletter',
      // SF-14 (FI-324) append
      rma: 'Trả hàng',
      loyalty: 'Điểm thưởng',
      // SF-5 (FI-395) append
      group: {
        overview: 'Tổng quan',
        products: 'Sản phẩm',
        orders: 'Đơn hàng',
        engagement: 'Khách hàng & tương tác',
        system: 'Hệ thống'
      }
    },
    newsletter: {
      title: 'Newsletter — người nhận tin',
      email: 'Email',
      subscribedAt: 'Đăng ký lúc',
      subscribers: 'subscriber',
      empty: 'Chưa có ai đăng ký'
    },
    audit: {
      title: 'Nhật ký hệ thống',
      eventType: 'Loại sự kiện',
      from: 'Từ thời điểm',
      to: 'Đến thời điểm',
      apply: 'Lọc',
      time: 'Thời gian',
      eventTypeCol: 'Sự kiện',
      correlation: 'Correlation ID',
      payload: 'Dữ liệu',
      events: 'sự kiện',
      empty: 'Chưa có sự kiện nào',
      emptyDesc: 'Không có event khớp bộ lọc — thử xóa filter hoặc bấm Lọc lại.'
    },
    topbar: {
      viewStorefront: 'Xem cửa hàng',
      logout: 'Đăng xuất'
    },
    common: {
      create: 'Thêm mới',
      edit: 'Sửa',
      delete: 'Xóa',
      save: 'Lưu',
      cancel: 'Hủy',
      search: 'Tìm kiếm',
      searchPh: 'Tìm theo tên/slug...',
      status: 'Trạng thái',
      all: 'Tất cả',
      actions: 'Thao tác',
      prev: 'Trước',
      next: 'Sau',
      pageOf: 'Trang {{page}}/{{total}}',
      total: '{{count}} bản ghi',
      mock: 'MOCK',
      confirmDelete: 'Bạn chắc chắn muốn xóa?',
      yes: 'Đồng ý',
      no: 'Bỏ qua',
      notFound: 'Không tìm thấy trang',
      retry: 'Thử lại',
      loadFail: 'Không tải được dữ liệu',
      saved: 'Đã lưu',
      deleted: 'Đã xóa',
      error: 'Có lỗi xảy ra',
      image: 'Ảnh',
      date: 'Ngày',
      from: 'Từ ngày',
      to: 'Đến ngày',
      // SF-5 (FI-395) append
      pageSize: 'Số dòng',
      sortLabel: 'Sắp xếp',
      pagination: 'Phân trang'
    },
    guard: {
      checking: 'Đang kiểm tra quyền...',
      forbiddenTitle: 'Không có quyền',
      forbiddenDesc: 'Tài khoản của bạn không có quyền truy cập khu vực quản trị.',
      backHome: 'Về trang chủ',
      standaloneGuest: 'Chưa đăng nhập. Hãy mở khu quản trị qua shell (http://localhost:5173) và đăng nhập bằng tài khoản admin.',
      loginViaShell: 'Đăng nhập qua shell'
    },
    status: {
      DRAFT: 'Nháp',
      PUBLISHED: 'Đăng bán',
      PENDING: 'Chờ duyệt',
      APPROVED: 'Đã duyệt',
      REJECTED: 'Từ chối',
      SUSPENDED: 'Tạm ngưng',
      PAID: 'Đã thanh toán',
      CONFIRMED: 'Đã xác nhận',
      SHIPPED: 'Đang giao',
      DELIVERED: 'Đã giao',
      CANCELLED: 'Đã hủy',
      FAILED: 'Thất bại',
      // SF-14 (FI-324) — RMA lifecycle append
      REQUESTED: 'Chờ xử lý',
      RECEIVED: 'Đã nhận hàng',
      REFUNDED: 'Đã hoàn tiền'
    },
    products: {
      title: 'Sản phẩm',
      new: 'Thêm sản phẩm',
      name: 'Tên (vi)',
      nameEn: 'Tên (en)',
      slugVi: 'Slug (vi)',
      slugEn: 'Slug (en)',
      slugAuto: 'Tự sinh từ tên khi bỏ trống',
      brand: 'Thương hiệu',
      category: 'Danh mục',
      official: 'Chính hãng',
      description: 'Mô tả (vi)',
      descriptionEn: 'Mô tả (en)',
      price: 'Giá bán (₫)',
      comparePrice: 'Giá niem yết (₫)',
      comparePriceWarn: 'Giá niem yết nên lớn hơn giá bán',
      flashEndsAt: 'Flash sale kết thúc',
      tabInfo: 'Thông tin',
      tabSeo: 'SEO',
      tabPrice: 'Giá',
      tabVariants: 'Phân loại',
      tabImages: 'Ảnh',
      seoTitle: 'SEO title',
      seoDesc: 'SEO description',
      seoTitlePh: 'Bỏ trống → dùng tên sản phẩm',
      seoDescPh: 'Bỏ trống → cắt 160 ký tự từ mô tả',
      variants: 'Phân loại (variant)',
      addVariant: 'Thêm phân loại',
      removeVariant: 'Xóa dòng',
      variantName: 'Tên thuộc tính (vi)',
      variantNameEn: 'Tên thuộc tính (en)',
      options: 'Tùy chọn',
      optionsPh: 'color=đỏ, size=XL',
      optionsInvalid: 'Sai định dạng — dùng key=giá trị, phân cách bởi dấu phẩy',
      priceDelta: 'Chênh giá (₫)',
      stock: 'Tồn kho',
      images: 'Ảnh sản phẩm',
      imageUrl: 'URL ảnh',
      imageAlt: 'Mô tả ảnh (alt)',
      exportCsv: 'Xuất CSV',
      addImage: 'Thêm ảnh',
      uploadImage: 'Tải ảnh lên',
      uploadingImage: 'Đang tải lên…',
      imageUploaded: 'Đã tải ảnh lên',
      moveUp: 'Lên',
      moveDown: 'Xuống',
      publish: 'Đăng bán',
      draft: 'Lưu nháp',
      created: 'Đã tạo sản phẩm',
      updated: 'Đã cập nhật sản phẩm',
      seeStorefront: 'Xem trên cửa hàng',
      seeStorefrontEn: 'Bản tiếng Anh',
      deactivate: 'Ngừng bán',
      deactivateConfirm: 'Ngừng bán sản phẩm này? Sản phẩm sẽ ẩn khỏi cửa hàng.',
      deactivated: 'Đã ngừng bán sản phẩm',
      empty: 'Chưa có sản phẩm nào',
      variantTotal: '{{count}} phiên bản',
      subTabVi: 'Tiếng Việt',
      subTabEn: 'English (bỏ trống → dùng tiếng Việt)'
    },
    categories: {
      title: 'Danh mục',
      new: 'Thêm danh mục',
      edit: 'Sửa danh mục',
      name: 'Tên (vi)',
      nameEn: 'Tên (en)',
      slugVi: 'Slug (vi)',
      slugEn: 'Slug (en)',
      parent: 'Danh mục cha',
      parentRoot: '— Danh mục gốc —',
      deleteBlocked: 'Không xóa được: danh mục đang có sản phẩm hoặc danh mục con',
      created: 'Đã tạo danh mục',
      updated: 'Đã cập nhật danh mục',
      deleted: 'Đã xóa danh mục',
      empty: 'Chưa có danh mục nào'
    },
    coupons: {
      title: 'Mã giảm giá',
      new: 'Thêm mã',
      edit: 'Sửa mã',
      code: 'Mã',
      type: 'Kiểu',
      percent: 'Phần trăm (%)',
      fixed: 'Số tiền cố định (₫)',
      value: 'Giá trị',
      minOrder: 'Đơn tối thiểu (₫)',
      startsAt: 'Bắt đầu',
      endsAt: 'Kết thúc',
      usage: 'Lượt dùng',
      usageOf: '{{used}}/{{limit}}',
      active: 'Kích hoạt',
      description: 'Mô tả',
      created: 'Đã tạo mã giảm giá',
      updated: 'Đã cập nhật mã giảm giá',
      toggled: 'Đã đổi trạng thái mã',
      empty: 'Chưa có mã giảm giá nào',
      inactive: 'Tắt',
      deleteBlocked: 'Không xóa được mã',
      codeLocked: 'Mã không đổi khi sửa',
      errCode: 'Mã 1-64 ký tự [A-Za-z0-9_-]',
      errValue: 'Giá trị không hợp lệ (PERCENT 1-100, FIXED > 0)',
      errMinOrder: 'Đơn tối thiểu phải ≥ 0',
      errWindow: 'Kết thúc phải sau bắt đầu',
      errLimit: 'Giới hạn lượt phải ≥ 1 (trống = không giới hạn)'
    },
    affiliates: {
      title: 'Affiliate',
      colCode: 'Ref code',
      colRate: 'Hoa hồng (%)',
      colClicks: 'Clicks',
      colConversions: 'Chuyển đổi',
      colEarnings: 'Hoa hồng',
      statTotal: 'Tổng hồ sơ',
      statClicks: 'Clicks',
      statConversions: 'Chuyển đổi',
      statCommission: 'Tổng hoa hồng',
      approve: 'Duyệt',
      approveDone: 'Đã duyệt — ref code đã sinh',
      reject: 'Từ chối',
      rejectDone: 'Đã từ chối',
      suspend: 'Tạm ngưng',
      suspendDone: 'Đã tạm ngưng — link ngừng track',
      reactivate: 'Kích hoạt lại',
      reactivateDone: 'Đã kích hoạt lại',
      rateEditHint: 'Click để đổi rate (áp cho đơn sau)',
      rateInvalid: 'Rate phải trong khoảng (0, 50]',
      empty: 'Chưa có hồ sơ affiliate nào'
    },
    // ── SF-14 (FI-324) — RMA + loyalty append ───────────────────────────────
    rma: {
      title: 'Yêu cầu trả hàng',
      colId: 'Mã RMA',
      colOrder: 'Đơn hàng',
      colReason: 'Lý do',
      colItems: 'Sản phẩm trả',
      approve: 'Duyệt',
      approveDone: 'Đã duyệt yêu cầu trả hàng',
      reject: 'Từ chối',
      rejectDone: 'Đã từ chối yêu cầu',
      markReceived: 'Nhận hàng',
      markReceivedDone: 'Đã xác nhận nhận hàng trả',
      refund: 'Hoàn tiền',
      refundDone: 'Đã hoàn tiền',
      empty: 'Không có yêu cầu trả hàng nào'
    },
    loyalty: {
      title: 'Điểm thưởng',
      lookupTitle: 'Tra cứu khách hàng',
      lookupPh: 'Nhập user id (uuid)',
      lookup: 'Tra cứu',
      balance: 'Điểm hiện có',
      totalEarned: 'Tổng đã nhận',
      ledger: 'Sổ điểm',
      adjustTitle: 'Chỉnh điểm thủ công',
      adjustPoints: 'Số điểm (+/-)',
      adjustNote: 'Ghi chú',
      adjust: 'Áp dụng',
      adjustDone: 'Đã điều chỉnh điểm',
      empty: 'Nhập user id để tra cứu',
      notFound: 'Không có dữ liệu — kiểm tra user id'
    },
    reviews: {
      title: 'Kiểm duyệt đánh giá',
      product: 'Sản phẩm',
      user: 'Người dùng',
      rating: 'Điểm',
      content: 'Nội dung',
      verified: 'Đã mua hàng',
      approve: 'Duyệt',
      reject: 'Ẩn',
      approved: 'Đã duyệt đánh giá',
      rejected: 'Đã ẩn đánh giá',
      empty: 'Không có đánh giá nào chờ duyệt'
    },
    orders: {
      title: 'Đơn hàng',
      exportCsv: 'Xuất CSV',
      order: 'Mã đơn',
      customer: 'Khách hàng',
      items: 'Sản phẩm',
      itemsCount: 'SL',
      total: 'Tổng tiền',
      payment: 'Thanh toán',
      paymentStripe: 'Stripe',
      paymentCod: 'COD',
      detail: 'Chi tiết đơn',
      address: 'Địa chỉ giao hàng',
      timeline: 'Lịch sử đơn',
      invoice: 'Tải hóa đơn',
      invoiceDone: 'Đã tải hóa đơn (bản demo)',
      ship: 'Giao hàng',
      deliver: 'Hoàn tất giao',
      cancel: 'Hủy đơn',
      cancelConfirm: 'Hủy đơn hàng này?',
      shipped: 'Đã chuyển trạng thái giao hàng',
      delivered: 'Đã hoàn tất giao hàng',
      cancelled: 'Đã hủy đơn',
      invalidTransition: 'Không chuyển được trạng thái đơn này',
      couponCode: 'Mã giảm giá',
      affiliateCode: 'Mã tiếp thị',
      empty: 'Chưa có đơn hàng nào',
      phone: 'Điện thoại',
      subtotal: 'Tổng tiền hàng',
      shipping: 'Vận chuyển'
    },
    dashboard: {
      title: 'Tổng quan',
      revenueToday: 'Doanh thu hôm nay',
      revenue7d: 'Doanh thu 7 ngày',
      ordersToday: 'Đơn hôm nay',
      aov: 'Giá trị đơn TB (AOV)',
      revenueChart: 'Doanh thu theo ngày (14 ngày)',
      topChart: 'Sản phẩm bán chạy',
      lowStock: 'Sắp hết hàng (tồn thấp)',
      lowStockEmpty: 'Không có sản phẩm nào sắp hết hàng',
      lowStockFail: 'Không tải được tồn kho thấp',
      product: 'Sản phẩm',
      variant: 'Phiên bản',
      available: 'Khả dụng',
      threshold: 'Ngưỡng',
      revenue: 'Doanh thu',
      ordersCol: 'Đơn',
      qty: 'Số lượng'
    }
  },
  // ── SF-1 FI-398 chrome (anchor: cuối file trước export — duy trì merge sạch) ──
  // Nguồn label cho package @ecommerce/chrome — string MIRROR các nguồn hiện có
  // (nav.home, shell.theme.*, shell.cart.aria, account.menu.*, nav.login/register,
  // storefront lib/i18n footer.*) — KHÔNG xóa/sửa key cũ.
  chrome: {
    header: {
      aria: 'Trang chủ'
    },
    cart: {
      aria: 'Giỏ hàng — {{count}} sản phẩm'
    },
    theme: {
      toLight: 'Chuyển giao diện sáng',
      toDark: 'Chuyển giao diện tối',
      light: 'Sáng',
      dark: 'Tối'
    },
    menu: {
      account: 'Tài khoản',
      orders: 'Đơn hàng của tôi',
      logout: 'Đăng xuất',
      displayNameFallback: 'Tài khoản'
    },
    guest: {
      login: 'Đăng nhập',
      register: 'Đăng ký'
    },
    locale: {
      label: 'Ngôn ngữ',
      vi: 'Tiếng Việt',
      en: 'English'
    },
    footer: {
      colCategories: 'Danh mục nổi bật',
      catElectronics: 'Điện Tử',
      catFashion: 'Thời Trang',
      catHome: 'Nhà Cửa',
      catBooks: 'Sách',
      catBeauty: 'Làm Đẹp',
      colAccount: 'Tài khoản',
      linkCart: 'Giỏ hàng',
      linkAccount: 'Tài khoản',
      linkOrders: 'Đơn hàng của tôi',
      linkWishlist: 'Sản phẩm yêu thích',
      linkMyReviews: 'Đánh giá của tôi'
    }
  }
};
