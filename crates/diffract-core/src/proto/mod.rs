// SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

//! Generated protocol buffer code.
//!
//! This module re-exports the generated protobuf types and service definitions.

#[allow(
    clippy::all,
    clippy::pedantic,
    clippy::nursery,
    unused_qualifications,
    rust_2018_idioms
)]
pub mod diffract {
    include!(concat!(env!("OUT_DIR"), "/diffract.v1.rs"));
}

#[allow(
    clippy::all,
    clippy::pedantic,
    clippy::nursery,
    unused_qualifications,
    rust_2018_idioms
)]
pub mod datamodel {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/diffract.datamodel.v1.rs"));
    }
}

#[allow(
    clippy::all,
    clippy::pedantic,
    clippy::nursery,
    unused_qualifications,
    rust_2018_idioms
)]
pub mod sandbox {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/diffract.sandbox.v1.rs"));
    }
}

#[allow(
    clippy::all,
    clippy::pedantic,
    clippy::nursery,
    unused_qualifications,
    rust_2018_idioms
)]
pub mod test {
    include!(concat!(env!("OUT_DIR"), "/diffract.test.v1.rs"));
}

#[allow(
    clippy::all,
    clippy::pedantic,
    clippy::nursery,
    unused_qualifications,
    rust_2018_idioms
)]
pub mod inference {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/diffract.inference.v1.rs"));
    }
}

pub use datamodel::v1::*;
pub use inference::v1::*;
pub use diffract::*;
pub use sandbox::v1::*;
pub use test::ObjectForTest;
