import type { DraftOption, UpgradeInventoryItem } from '../types/game';

type OverlayProps = {
  title: string;
  subtitle: string;
};

export function Overlay({ title, subtitle }: OverlayProps) {
  return (
    <div className="overlay">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

type DraftOverlayProps = {
  options: DraftOption[];
  onPick: (index: number) => void;
};

export function DraftOverlay({ options, onPick }: DraftOverlayProps) {
  return (
    <div className="overlay draft-overlay">
      <div className="draft-panel">
        <h2>Level Up — Choose an Upgrade</h2>
        <p>Tap a card or press 1 / 2 / 3</p>
        <div className="draft-cards">
          {options.map((option, index) => (
            <button key={option.id + index} className={`draft-card rarity-${option.rarity}`} onClick={() => onPick(index)}>
              <div className="draft-top">
                <span>{option.icon}</span>
                <span>{index + 1}</span>
              </div>
              <h3>{option.title}</h3>
              <p>{option.description}</p>
              <span className="rarity-label">{option.rarity}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type UpgradeInventoryProps = {
  items: UpgradeInventoryItem[];
};

export function UpgradeInventoryPanel({ items }: UpgradeInventoryProps) {
  return (
    <aside className="upgrade-inventory">
      <h3>Upgrades</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {item.stacks > 1 ? <strong>x{item.stacks}</strong> : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
