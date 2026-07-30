const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function App() {
  return (
    <main>
      <p className="eyebrow">Candidate exercise</p>
      <h1>Online Library</h1>
      <p>
        The library application is being set up. The API health endpoint is available at{" "}
        <a href={`${apiUrl}/up`}>{apiUrl}/up</a>.
      </p>
    </main>
  );
}
