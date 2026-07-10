// Debug version for mobile testing
export function App() {
  return (
    <div style={{ 
      padding: '20px', 
      fontSize: '18px', 
      backgroundColor: 'lightblue',
      minHeight: '100vh'
    }}>
      <h1>ESTOQUI DEBUG</h1>
      <p>If you see this, React is working!</p>
      <p>Current URL: {window.location.href}</p>
      <p>User Agent: {navigator.userAgent}</p>
    </div>
  )
}