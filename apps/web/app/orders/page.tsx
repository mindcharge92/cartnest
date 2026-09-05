import { AuthGuard } from "../../components/auth-guard";
import { BuyerOrdersPageContent } from "../../features/orders/buyer-orders-page";

export default function OrdersPage() {
  return (
    <AuthGuard>
      <BuyerOrdersPageContent />
    </AuthGuard>
  );
}
