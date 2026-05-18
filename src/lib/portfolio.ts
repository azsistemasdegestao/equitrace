export type TxInput = {
  ticker: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  date: Date;
};

export type Position = {
  ticker: string;
  quantity: number;
  avgCost: number;
};

export function computePositions(transactions: TxInput[]): Position[] {
  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

  const map = new Map<string, { qty: number; cost: number }>();

  for (const tx of sorted) {
    const pos = map.get(tx.ticker) ?? { qty: 0, cost: 0 };

    if (tx.type === "BUY") {
      pos.cost += tx.quantity * tx.price;
      pos.qty += tx.quantity;
    } else {
      // SELL: PM stays the same, reduce qty and cost proportionally
      const pm = pos.qty > 0 ? pos.cost / pos.qty : 0;
      pos.qty -= tx.quantity;
      pos.cost = pm * pos.qty;
    }

    map.set(tx.ticker, pos);
  }

  const positions: Position[] = [];
  for (const [ticker, { qty, cost }] of map.entries()) {
    if (qty > 1e-8) {
      positions.push({ ticker, quantity: qty, avgCost: cost / qty });
    }
  }

  return positions;
}
