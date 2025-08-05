import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import { auth } from "../firebase/firebase";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess(true);
      
      // Redirect to login page after 3 seconds
      setTimeout(() => {
        navigate("/login");
      }, 3000);
      
    } catch (err) {
      console.error("Password reset error:", err);
      // Still show success for security (don't reveal if email exists)
      setSuccess(true);
      
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex justify-between items-center p-4 sm:p-6 lg:p-8">
        <Link to="/" className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-lg sm:text-xl">
            L
          </div>
          <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Lineup
          </span>
        </Link>
        <Link 
          to="/login"
          className="px-4 py-2 sm:px-6 sm:py-2 text-sm sm:text-base text-white/80 hover:text-white transition-colors duration-300 font-medium"
        >
          Back to Login
        </Link>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <span className="inline-block text-4xl sm:text-5xl mb-2">🔑</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Reset Password
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-md mx-auto">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        {/* Reset Form */}
        <div className="w-full max-w-md">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20">
            {!success ? (
              <>
                <h2 className="text-2xl font-bold text-center mb-6 text-white">
                  Forgot Your Password?
                </h2>
                
                <p className="text-white/80 text-center mb-6 text-sm">
                  No worries! Enter your email address below and we'll send you instructions to reset your password.
                </p>

                <form onSubmit={handleResetPassword} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={loading}
                    className={`w-full py-4 px-8 rounded-xl text-lg font-bold transition-all duration-300 transform ${
                      loading 
                        ? 'bg-white/20 text-white/50 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white hover:scale-105 shadow-2xl hover:shadow-purple-500/40'
                    }`}
                  >
                    {loading ? "Sending..." : "Send Reset Link"}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center">
                <div className="mb-6">
                  <span className="inline-block text-5xl mb-4">✅</span>
                </div>
                <h2 className="text-2xl font-bold mb-4 text-white">
                  Check Your Email
                </h2>
                <div className="p-4 bg-green-500/20 border border-green-400/30 rounded-xl mb-6">
                  <p className="text-sm text-green-200">
                    If an account with that email exists, a password reset link has been sent. 
                    Please check your inbox and spam folder.
                  </p>
                </div>
                <p className="text-white/60 text-sm">
                  Redirecting to login page in a few seconds...
                </p>
              </div>
            )}

            {!success && (
              <div className="mt-6 text-center">
                <p className="text-white/60">
                  Remember your password?{" "}
                  <Link to="/login" className="text-purple-400 hover:text-purple-300 font-medium transition-colors duration-300">
                    Back to Login
                  </Link>
                </p>
              </div>
            )}
          </div>

          {/* Additional Info */}
          <div className="mt-6 text-center">
            <p className="text-xs text-white/60">
              Didn't receive an email? Check your spam folder or try again
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;