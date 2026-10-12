/**
 * Brand + navigation content. Edit this file to rebrand the store;
 * no component hard-codes these strings.
 */
export const site = {
  name: 'Nocturne',
  logoText: 'NOCTURNE',
  tagline: 'Garments for the after-hours',
  description: 'Contemporary clothing, bags and jewellery — designed in Mumbai, made in India.',
  supportEmail: 'care@nocturne.in',
  supportPhone: '+91 22 4000 1234',
  supportHours: 'Our stylists are available Monday to Saturday, 10am – 7pm IST.',
  locale: 'IN (EN) / INR',

  announcements: [
    'Free delivery above ₹2,999',
    'Free 14-day returns',
    'Cash on delivery available',
    'End of season — up to 50% off',
  ],

  freeShippingThreshold: 2999,
  shippingFee: 99,

  mainNav: [
    { label: 'Sale', to: '/shop/sale', highlight: true },
    { label: 'New', to: '/shop/new' },
    { label: 'Women', to: '/shop/women' },
    { label: 'Men', to: '/shop/men' },
    { label: 'Bags', to: '/shop/bags' },
    { label: 'Shoes', to: '/shop/shoes' },
    { label: 'Jewellery', to: '/shop/jewellery' },
  ],

  homeCategories: ['women', 'men', 'bags', 'shoes', 'jewellery'],

  assurances: [
    {
      title: 'Express shipping',
      body: 'Free home delivery on orders above ₹2,999, in 2–5 working days across India.',
    },
    { title: 'Free returns', body: 'Free exchanges and returns within 14 days of delivery.' },
    {
      title: 'Secure payments',
      body: 'Pay with UPI, cards, net banking or wallets via Razorpay — or cash on delivery.',
    },
  ],

  footerColumns: [
    {
      title: 'Customer care',
      links: [
        { label: 'FAQ', to: '/help/faq' },
        { label: 'Track your order', to: '/orders' },
        { label: 'Returns & exchanges', to: '/help/returns' },
        { label: 'Size guide', to: '/help/size-guide' },
      ],
    },
    {
      title: 'About us',
      links: [
        { label: 'Our values', to: '/about' },
        { label: 'New in women', to: '/shop/women' },
        { label: 'New in men', to: '/shop/men' },
        { label: 'Stores', to: '/stores' },
      ],
    },
    {
      title: 'Follow us',
      links: [
        { label: 'Instagram', to: 'https://instagram.com' },
        { label: 'GitHub', to: 'https://github.com/Jatinonly' },
        { label: 'LinkedIn', to: 'https://www.linkedin.com/in/jatin-kumar-9697a728b' },
      ],
    },
  ],

  legalLinks: [
    { label: 'Terms of sale', to: '/legal/terms' },
    { label: 'Privacy policy', to: '/legal/privacy' },
    { label: 'Cookie policy', to: '/legal/cookies' },
  ],
}
