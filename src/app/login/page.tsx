import { AuthForm } from "@/components/auth-form";
import { demoEnabled } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <AuthForm mode="login" demo={demoEnabled()} />;
}
