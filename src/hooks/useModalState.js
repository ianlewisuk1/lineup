import { useState } from "react";

/**
 * Shared modal state for success/error notification modals.
 * Eliminates the duplicated modal useState + helper pattern across pages.
 */
export function useModalState() {
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  const showSuccess = (title, message) => {
    setModalTitle(title);
    setModalMessage(message);
    setShowSuccessModal(true);
  };

  const showError = (title, message) => {
    setModalTitle(title);
    setModalMessage(message);
    setShowErrorModal(true);
  };

  const closeModals = () => {
    setShowSuccessModal(false);
    setShowErrorModal(false);
    setModalTitle("");
    setModalMessage("");
  };

  return {
    showSuccessModal,
    showErrorModal,
    modalTitle,
    modalMessage,
    showSuccess,
    showError,
    closeModals,
  };
}
