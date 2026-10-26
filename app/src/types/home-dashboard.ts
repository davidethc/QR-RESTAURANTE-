/** One figure split by sales channel: total = pos (point of sale) + digital (digital menu). */
export type ChannelSplit = {
  total: number;
  pos: number;
  digital: number;
};

export type HomeDashboardProduct = {
  name: string;
  quantity: number;
  amount: number;
};

/** Shape returned by the `get_home_dashboard` RPC (M14). Money only counts what was charged. */
export type HomeDashboard = {
  from: string;
  to: string;
  days: number;
  sales: ChannelSplit;
  orders: ChannelSplit;
  shipping: ChannelSplit;
  tips: ChannelSplit;
  avg_ticket: ChannelSplit;
  /** ISO weekday 1 (Monday) … 7 (Sunday), average sales per calendar day. */
  by_weekday: { dow: number; avg_sales: number }[];
  by_method: (ChannelSplit & { method: string })[];
  by_service: (ChannelSplit & { service_type: string })[];
  top_products: HomeDashboardProduct[];
  bottom_products: HomeDashboardProduct[];
};
