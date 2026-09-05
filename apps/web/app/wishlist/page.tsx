import { AuthGuard } from "../../components/auth-guard";
import { WishlistPageContent } from "../../features/commerce/wishlist-page";

export default function WishlistPage() {
  return (
    <AuthGuard>
      <WishlistPageContent />
    </AuthGuard>
  );
}
