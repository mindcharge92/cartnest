import { AuthGuard } from "../../components/auth-guard";
import { CartPageContent } from "../../features/commerce/cart-page";

export default function CartPage() {
  return (
    <AuthGuard>
      <CartPageContent />
    </AuthGuard>
  );
}
