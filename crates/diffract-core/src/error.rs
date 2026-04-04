// SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

//! Common error types for Diffract.

use miette::Diagnostic;
use thiserror::Error;

/// Result type alias using Diffract's error type.
pub type Result<T> = std::result::Result<T, Error>;

/// Diffract error type.
#[derive(Debug, Error, Diagnostic)]
pub enum Error {
    /// Configuration error.
    #[error("configuration error: {message}")]
    #[diagnostic(code(diffract::config))]
    Config {
        /// Error message.
        message: String,
    },

    /// I/O error.
    #[error("I/O error: {source}")]
    #[diagnostic(code(diffract::io))]
    Io {
        /// Underlying I/O error.
        #[from]
        source: std::io::Error,
    },

    /// TLS error.
    #[error("TLS error: {message}")]
    #[diagnostic(code(diffract::tls))]
    Tls {
        /// Error message.
        message: String,
    },

    /// gRPC transport error.
    #[error("transport error: {message}")]
    #[diagnostic(code(diffract::transport))]
    Transport {
        /// Error message.
        message: String,
    },

    /// Execution error.
    #[error("execution error: {message}")]
    #[diagnostic(code(diffract::execution))]
    Execution {
        /// Error message.
        message: String,
    },

    /// Process error.
    #[error("process error: {message}")]
    #[diagnostic(code(diffract::process))]
    Process {
        /// Error message.
        message: String,
    },

    /// Timeout error.
    #[error("operation timed out")]
    #[diagnostic(code(diffract::timeout))]
    Timeout,
}

impl Error {
    /// Create a configuration error.
    pub fn config(message: impl Into<String>) -> Self {
        Self::Config {
            message: message.into(),
        }
    }

    /// Create a TLS error.
    pub fn tls(message: impl Into<String>) -> Self {
        Self::Tls {
            message: message.into(),
        }
    }

    /// Create a transport error.
    pub fn transport(message: impl Into<String>) -> Self {
        Self::Transport {
            message: message.into(),
        }
    }

    /// Create an execution error.
    pub fn execution(message: impl Into<String>) -> Self {
        Self::Execution {
            message: message.into(),
        }
    }

    /// Create a process error.
    pub fn process(message: impl Into<String>) -> Self {
        Self::Process {
            message: message.into(),
        }
    }
}
