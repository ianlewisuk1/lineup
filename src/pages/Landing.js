import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

function Landing() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-4 sm:right-10 w-56 sm:w-96 h-56 sm:h-96 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex justify-between items-center p-4 sm:p-6 lg:p-8">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center font-bold text-lg sm:text-xl">
            L
          </div>
          <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Lineup
          </span>
        </div>
        <div className="flex space-x-2 sm:space-x-4">
          <Link 
            to="/login"
            className="px-3 py-2 sm:px-6 sm:py-2 text-sm sm:text-base text-white/80 hover:text-white transition-colors duration-300 font-medium"
          >
            Login
          </Link>
          <Link 
            to="/signup"
            className="px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-base bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 rounded-full font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-purple-500/25"
          >
            Sign Up Free
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 sm:px-6 py-8 sm:py-16">
        <div className={`transform transition-all duration-1000 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          <div className="mb-4 sm:mb-6">
            <span className="inline-block text-4xl sm:text-6xl mb-2 sm:mb-4 animate-bounce">🏈</span>
          </div>
          
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black mb-4 sm:mb-6 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              College Football
            </span>
            <br />
            <span className="text-white">Fantasy</span>
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Reimagined
            </span>
          </h1>

          <p className="text-lg sm:text-xl lg:text-2xl text-white/80 mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed px-2">
            Pick college teams, not individual players. Simple. Win points when your teams win. Lose points when they lose.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 justify-center mb-6 sm:mb-12 px-4">
            <Link 
              to="/signup"
              className="w-full sm:w-auto px-8 sm:px-10 py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 rounded-full text-lg sm:text-xl font-bold transition-all duration-300 transform hover:scale-105 shadow-2xl hover:shadow-purple-500/40 text-center"
            >
              Start Playing Now
            </Link>
            <Link 
              to="/how-to-play"
              className="w-full sm:w-auto px-8 sm:px-10 py-4 border-2 border-white/30 hover:border-white/60 rounded-full text-lg sm:text-xl font-semibold transition-all duration-300 hover:bg-white/10 backdrop-blur-sm text-center"
            >
              Learn More
            </Link>
          </div>

          {/* New Platform Badge */}
          <div className="inline-flex items-center px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20 mb-6 sm:mb-8">
            <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
            <span className="text-sm font-medium">🚀 New Platform - Be Among the First!</span>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="relative z-10 px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-center mb-6 sm:mb-10">
            Why Choose Lineup?
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2">
              <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">⚡</div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Dead Simple</h3>
              <p className="text-sm sm:text-base text-white/80">Pick teams, not players. No hours of research. No complex stats. Just pick who wins.</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2">
              <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">🏈</div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Team Based</h3>
              <p className="text-sm sm:text-base text-white/80">Choose college teams you believe in. Win points when they win, lose when they lose.</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 sm:p-8 border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2 sm:col-span-2 lg:col-span-1">
              <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">🧠</div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Pure Skill</h3>
              <p className="text-sm sm:text-base text-white/80">No gambling, no luck. Just your knowledge of college football teams.</p>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="relative z-10 px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-6 sm:mb-10">
            How It Works
          </h2>
          <div className="grid gap-6 sm:grid-cols-3 sm:gap-8">
            <div className="space-y-3 sm:space-y-4">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold mx-auto">
                1
              </div>
              <h3 className="text-lg sm:text-xl font-bold">Pick Teams</h3>
              <p className="text-sm sm:text-base text-white/80">Select college teams you think will win this week</p>
            </div>
            <div className="space-y-3 sm:space-y-4">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold mx-auto">
                2
              </div>
              <h3 className="text-lg sm:text-xl font-bold">Watch Games</h3>
              <p className="text-sm sm:text-base text-white/80">Cheer for your teams on Saturday</p>
            </div>
            <div className="space-y-3 sm:space-y-4">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold mx-auto">
                3
              </div>
              <h3 className="text-lg sm:text-xl font-bold">Earn Points</h3>
              <p className="text-sm sm:text-base text-white/80">Win points when your teams win, lose when they lose</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Footer */}
      <div className="relative z-10 text-center px-4 sm:px-6 py-8 sm:py-12">
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 sm:mb-6">
          Ready to Pick Your Teams?
        </h2>
        <p className="text-base sm:text-lg text-white/80 mb-6 sm:mb-8 max-w-2xl mx-auto">
          No complex research needed. Just pick the college teams you believe in. It's free to start!
        </p>
        <Link 
          to="/signup"
          className="inline-block w-full sm:w-auto px-8 sm:px-12 py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 rounded-full text-lg sm:text-xl font-bold transition-all duration-300 transform hover:scale-105 shadow-2xl hover:shadow-purple-500/40 text-center"
        >
          Join Lineup Today
        </Link>
      </div>
    </div>
  );
}

export default Landing;