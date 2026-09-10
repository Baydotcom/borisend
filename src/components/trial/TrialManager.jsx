import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import MobileTrialInfoModal from "./MobileTrialInfoModal";
import WelcomeTrialModal from "./WelcomeTrialModal";
import { useTrialStatus } from "@/hooks/useTrialStatus";

export default function TrialManager() {
  const location = useLocation();
  const { trialStatus, loading, reload } = useTrialStatus();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [modalRecorded, setModalRecorded] = useState(false);

  // Centralized trial creation — fires after ANY auth provider (email, Google, Apple)
  useEffect(() => {
    const justRegistered = sessionStorage.getItem("borisend_just_registered");
    if (!justRegistered || loading) return;

    sessionStorage.removeItem("borisend_just_registered");

    // If no active trial exists yet (Google/Apple users), create one via startTrial.
    // startTrial is idempotent — safe even if email OTP already created one.
    if (!trialStatus?.trial_active && !trialStatus?.is_paused && !trialStatus?.trial_conversion_scheduled) {
      base44.functions.invoke("startTrial", {})
        .then(() => reload())
        .then(() => setShowWelcomeModal(true))
        .catch((e) => console.error("Failed to start trial:", e));
    } else if (trialStatus?.trial_active) {
      setShowWelcomeModal(true);
    }
  }, [loading, trialStatus, reload]);

  // Proactive final-day payment modal
  useEffect(() => {
    if (!loading && trialStatus?.show_payment_modal && !modalRecorded) {
      setShowPaymentModal(true);
      setModalRecorded(true);
      // Record that the modal was shown
      base44.functions.invoke("recordTrialModalShown", {}).catch(() => {});
    }
  }, [loading, trialStatus, modalRecorded]);

  const handlePaymentModalClose = () => {
    setShowPaymentModal(false);
    reload();
  };

  const handleWelcomeClose = () => {
    setShowWelcomeModal(false);
  };

  return (
    <>
      <MobileTrialInfoModal
        open={showPaymentModal}
        onClose={handlePaymentModalClose}
        trialStatus={trialStatus}
      />
      <WelcomeTrialModal
        open={showWelcomeModal}
        onClose={handleWelcomeClose}
        trialInfo={trialStatus}
      />
    </>
  );
}