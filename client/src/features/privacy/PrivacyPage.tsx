export function PrivacyPage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', fontFamily: 'Inter, sans-serif', color: '#1a1a1a', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, color: '#0057FF' }}>Privacy Policy</h1>
      <p style={{ color: '#666', marginBottom: 40 }}>Last updated: July 9, 2026</p>

      <p>Estoqui ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our mobile application and services.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 36, marginBottom: 12 }}>1. Information We Collect</h2>
      <p>We collect the following types of information:</p>
      <ul style={{ paddingLeft: 24, marginTop: 8 }}>
        <li><strong>Account Information:</strong> Email address and password when you register</li>
        <li><strong>Business Data:</strong> Inventory items, product catalog, stock levels, vendor information, and order history that you input into the app</li>
        <li><strong>Usage Data:</strong> App activity, feature usage, and performance data to improve our service</li>
        <li><strong>Device Information:</strong> Device type, operating system, and app version</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 36, marginBottom: 12 }}>2. How We Use Your Information</h2>
      <ul style={{ paddingLeft: 24 }}>
        <li>To provide and operate the Estoqui inventory management service</li>
        <li>To authenticate your account and ensure secure access</li>
        <li>To send important service updates and notifications</li>
        <li>To improve app performance and features</li>
        <li>To provide customer support</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 36, marginBottom: 12 }}>3. Data Storage & Security</h2>
      <p>Your data is securely stored using Supabase, a trusted cloud infrastructure provider. We use industry-standard encryption (HTTPS/TLS) for all data in transit. Your inventory and business data is private to your account and never shared with third parties.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 36, marginBottom: 12 }}>4. Data Sharing</h2>
      <p>We do <strong>not</strong> sell, rent, or share your personal data with third parties for marketing purposes. We may share data only in the following cases:</p>
      <ul style={{ paddingLeft: 24 }}>
        <li>With service providers necessary to operate our platform (e.g., Supabase for database hosting)</li>
        <li>When required by law or legal process</li>
        <li>To protect the rights, property, or safety of Estoqui or our users</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 36, marginBottom: 12 }}>5. Your Rights</h2>
      <p>You have the right to:</p>
      <ul style={{ paddingLeft: 24 }}>
        <li>Access the personal data we hold about you</li>
        <li>Request correction or deletion of your data</li>
        <li>Export your business data at any time</li>
        <li>Close your account and have your data deleted</li>
      </ul>
      <p>To exercise these rights, contact us at <a href="mailto:sales@estoqui.com" style={{ color: '#0057FF' }}>sales@estoqui.com</a></p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 36, marginBottom: 12 }}>6. Camera & Device Permissions</h2>
      <p>Estoqui requests access to your device camera solely for barcode scanning functionality. This data is processed locally on your device and is not stored or transmitted to our servers.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 36, marginBottom: 12 }}>7. Children's Privacy</h2>
      <p>Estoqui is a business tool intended for adults. We do not knowingly collect data from anyone under the age of 13.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 36, marginBottom: 12 }}>8. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email or in-app notification. Continued use of the app after changes constitutes acceptance of the updated policy.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 36, marginBottom: 12 }}>9. Contact Us</h2>
      <p>If you have any questions about this Privacy Policy, please contact us:</p>
      <p style={{ marginTop: 8 }}>
        <strong>Estoqui</strong><br />
        Email: <a href="mailto:sales@estoqui.com" style={{ color: '#0057FF' }}>sales@estoqui.com</a><br />
        Website: <a href="https://estoqui.com" style={{ color: '#0057FF' }}>https://estoqui.com</a>
      </p>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #eee', color: '#999', fontSize: 13 }}>
        © 2026 Estoqui. All rights reserved.
      </div>
    </div>
  )
}
