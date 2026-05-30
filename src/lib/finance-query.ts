import { queryOptions } from "@tanstack/react-query";
import { getFinanceData } from "./api/finance.functions";

export const financeQueryOptions = queryOptions({
  queryKey: ["finance"],
  queryFn: () => getFinanceData(),
  staleTime: 60_000,
  refetchOnWindowFocus: false,
});
