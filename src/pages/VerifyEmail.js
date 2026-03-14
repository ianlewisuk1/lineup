import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "../supabase/supabase";

function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || "";

  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "signup",
    });

    setLoading(false);

    if (verifyError) {
      setError(verifyError.message);
    } else {
      navigate("/home");
    }
  };

  const handleResend = async () => {
    setResent(false);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    if (!resendError) setResent(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <nav className="relative z-10 flex justify-between items-center p-4 sm:p-6 lg:p-8">
        <Link to="/" className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-lg sm:text-xl">
            L
          </div>
          <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Lineup
          </span>
        </Link>
      </nav>

      <div className="relative z-10 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="text-center mb-8">
          <div className="mb-4 text-4xl sm:text-5xl">📬</div>
          <h1 className="text-3xl sm:text-4xl font-black mb-4">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Check your email
            </span>
          </h1>
          <p className="text-lg text-white/80 max-w-md mx-auto">
            We sent a 6-digit code to <span className="text-white font-semibold">{email}</span>
          </p>
        </div>

        <div className="w-full max-w-md">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20">
            {error && (
              <div className="mb-6 p-4 bg-red-500/20 border border-red-400/30 rounded-xl">
                <p className="text-sm text-red-200 text-center">{error}</p>
              </div>
            )}
            {resent && (
              <div className="mb-6 p-4 bg-green-500/20 border border-green-400/30 rounded-xl">
                <p className="text-sm text-green-200 text-center">Code resent — check your inbox.</p>
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00000000"
                  maxLength={8}
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-center text-2xl tracking-widest placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                />
              </div>

              <button
                type="submit"
                disabled={loading || token.length < 8}
                className="w-full py-4 px-8 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-lg font-bold transition-all duration-300 transform hover:scale-105 shadow-2xl hover:shadow-purple-500/40 text-white"
              >
                {loading ? "Verifying..." : "Verify & Continue"}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-white/60 text-sm">
                Didn't get it?{" "}
                <button
                  onClick={handleResend}
                  className="text-purple-400 hover:text-purple-300 font-medium transition-colors duration-300"
                >
                  Resend code
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
