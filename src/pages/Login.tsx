import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { mockUsers } from "@/lib/mockData";
import { Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { API_CONFIG } from "@/lib/apiConfig";

const Login = () => {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loginMode, setLoginMode] = useState<"otp" | "password">("otp");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`${API_CONFIG.SIMULATION}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      if (response.ok) {
        setStep("otp");
        toast({
          title: "OTP Sent",
          description: "Please check your registered Telegram device.",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.detail || "Failed to send OTP",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection Error",
        description: "Could not reach the authentication server.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`${API_CONFIG.SIMULATION}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("userRole", data.role);
        localStorage.setItem("userName", data.name);
        localStorage.setItem("userPhone", data.phone);

        toast({
          title: "Login Successful",
          description: `Welcome back, ${data.name}!`,
        });
        
        // Always redirect to dashboard as it's the main landing page now
        navigate("/dashboard");
      } else {
        toast({
          title: "Invalid OTP",
          description: "The OTP you entered is incorrect.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Verification Error",
        description: "Something went wrong during OTP verification.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Mock password verification
    setTimeout(() => {
      let valid = false;
      let userData = { role: "", name: "", phone: "" };

      if (phone === "9876543210" && password === "admin123") {
        valid = true;
        userData = { role: "admin", name: "Admin User", phone: "9876543210" };
      }

      if (valid) {
        localStorage.setItem("userRole", userData.role);
        localStorage.setItem("userName", userData.name);
        localStorage.setItem("userPhone", userData.phone);

        toast({
          title: "Login Successful",
          description: `Welcome back, ${userData.name}!`,
        });
        navigate("/dashboard");
      } else {
        toast({
          title: "Invalid Credentials",
          description: "Check your phone number or password.",
          variant: "destructive",
        });
      }
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 right-4 z-50">
        <div className="flex items-center gap-2 glass px-3 py-1 rounded-full border border-primary/20">
          <span className="text-[10px] font-bold uppercase text-muted-foreground mr-1">Language</span>
          <LanguageSwitcher />
        </div>
      </div>
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-gradient-primary shadow-glow-primary">
              <Shield className="h-12 w-12 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Yatayat
          </h1>
          <p className="text-muted-foreground">Traffic Intelligence Platform</p>
        </div>

        <Card className="p-8 bg-gradient-card border-2 border-primary/20 shadow-glow-primary">
          <div className="flex gap-4 mb-6">
            <Button
              variant={loginMode === "otp" ? "default" : "outline"}
              className="flex-1 text-xs"
              onClick={() => { setLoginMode("otp"); setStep("phone"); }}
            >
              {t("auth.otpLogin")}
            </Button>
            <Button
              variant={loginMode === "password" ? "default" : "outline"}
              className="flex-1 text-xs"
              onClick={() => setLoginMode("password")}
            >
              {t("auth.passwordLogin")}
            </Button>
          </div>

          {loginMode === "otp" ? (
            step === "phone" ? (
              <form onSubmit={handleSendOTP} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("auth.phoneNumber")}</Label>
                  <div className="relative">
                    <Input
                      id="phone"
                      type="tel"
                      placeholder={t("auth.enterPhoneNumber")}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="bg-card border-border pl-10"
                    />
                    <span className="absolute left-3 top-2.5 text-muted-foreground">+91</span>
                  </div>
                </div>

                <Button type="submit" disabled={isLoading} className="w-full bg-gradient-primary hover:opacity-90 transition-opacity">
                  {isLoading ? t("auth.sending") : t("auth.sendOtp")}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOTP} className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label htmlFor="otp">{t("auth.verificationCode")}</Label>
                    <button type="button" onClick={() => setStep("phone")} className="text-xs text-primary hover:underline">{t("auth.changeNumber")}</button>
                  </div>
                  <Input
                    id="otp"
                    type="text"
                    maxLength={6}
                    placeholder={t("auth.enterOtp")}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                    className="bg-card border-border text-center tracking-[1em] text-xl font-bold"
                  />
                </div>

                <Button type="submit" disabled={isLoading} className="w-full bg-gradient-primary hover:opacity-90 transition-opacity">
                  {isLoading ? t("auth.verifying") : t("auth.verifyAndLogin")}
                </Button>
              </form>
            )
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="phone-pwd">Phone Number</Label>
                <div className="relative">
                  <Input
                    id="phone-pwd"
                    type="tel"
                    placeholder="Enter 10-digit number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="bg-card border-border pl-10"
                  />
                  <span className="absolute left-3 top-2.5 text-muted-foreground">+91</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-card border-border"
                />
              </div>

              <Button type="submit" disabled={isLoading} className="w-full bg-gradient-primary hover:opacity-90 transition-opacity">
                {isLoading ? t("auth.loggingIn") : t("auth.login")}
              </Button>
            </form>
          )}

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-2">Demo Credentials:</p>
            <div className="space-y-2 text-xs">
              <div>
                <p className="font-semibold">Admin Access:</p>
                <p>9876543210 / admin123</p>
              </div>
              <div className="pt-2 border-t border-border mt-2">
                <p className="font-semibold text-primary mb-1">Receive OTP on Telegram:</p>
                <a 
                  href="https://t.me/YatayatLoginBot" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.52-1.4.51-.46-.01-1.35-.26-2.01-.48-.81-.27-1.46-.42-1.4-.88.03-.24.36-.49.99-.75 3.84-1.67 6.4-2.77 7.69-3.3 3.65-1.5 4.41-1.76 4.9-1.77.11 0 .36.03.52.16.14.11.18.25.19.36.01.07.01.14 0 .21z"/>
                  </svg>
                  Join @YatayatLoginBot
                </a>
                <p className="text-[10px] text-muted-foreground mt-1">
                  1. Join bot<br/>
                  2. Share contact<br/>
                  3. Use phone above to login
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Login;