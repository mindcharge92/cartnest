import { AuthGuard } from "../../components/auth-guard";
import { CheckoutPageContent } from "../../features/commerce/checkout-page";

export default function CheckoutPage() {
  return (
    <AuthGuard>
      <CheckoutPageContent />
    </AuthGuard>
  );
}
