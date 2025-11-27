import { Assistant } from './assistant';

export default function Home() {
  return (
    <main>
      <div className="max-w-[var(--thread-max-width)] mx-auto">
        <Assistant/>
      </div>
    </main>
  );
}
