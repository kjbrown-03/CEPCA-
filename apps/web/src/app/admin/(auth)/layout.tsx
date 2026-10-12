import { AuthBrand } from './brand'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <AuthBrand />
      <main className="auth-form">{children}</main>
    </div>
  )
}
