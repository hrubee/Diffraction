# Diffract: Project Overview

Diffract is an Enterprise-grade **AI Agent Runtime** built for organizations that need to deploy autonomous AI agents without compromising security.

At its core, it solves a major problem in AI: **How do you give an agent enough power to be useful while ensuring it can't steal your data, leak API keys, or go rogue on your network?**

---

## 1. The Core Concept: "Kernel-Level Isolation"
Unlike standard AI wrappers that run agents directly on your machine or in a loose Docker container, Diffract wraps every agent in a highly restricted sandbox.

*   **Landlock LSM & seccomp**: Linux kernel features that restrict system calls (syscalls). An agent might be allowed to read a specific folder but forbidden from opening any new network connections or execution processes.
*   **Network Namespaces (NetNS)**: Each agent gets its own virtual network. By default, it has **zero** internet access.
*   **Deny-by-Default**: Every website or API the agent is allowed to talk to must be explicitly "allowed" via a YAML policy file.

## 2. The "Privacy Router" (L7 Proxy)
This architecture ensures that sensitive credentials never enter the agent's process space.

*   **API Key Isolation**: Your Anthropic or OpenAI keys are stored on the **host machine**, never inside the agent's sandbox.
*   **Inference Routing**: When the agent needs to perform inference, it sends a request to a local address (`inference.local`). 
*   **Credential Injection**: A proxy intercepts that request at the network layer, strips any temporary sandbox tokens, injects your **real API key**, and forwards it to the provider. 
*   **Result**: Even if an agent is compromised, it **cannot steal your API keys** because they aren't even in its memory.

## 3. Component Architecture
The project is split into several distinct layers:

| Component | Technology | Responsibility |
| :--- | :--- | :--- |
| **Security Engine** | Rust (`crates/`) | Low-level security boundaries and high-performance data routing. |
| **Agent Gateway** | Node.js (`agent/`) | The "brain" inside the sandbox. Manages chat interfaces and "skills." |
| **Control Plane** | Next.js (`ui/`) | Web dashboard for managing sandboxes, monitoring resources, and viewing audit logs. |
| **CLI** | Python/Node | The `diffract` command for onboarding and sandbox management. |
| **Reverse Proxy** | Caddy | Handles HTTPS, auto-TLS, and internal routing. |

## 4. Key Features & Operations
*   **One-Command Onboard**: Setup is simplified via an interactive wizard (`diffract onboard`).
*   **20+ Messaging Channels**: Native bridges to Telegram, Discord, Slack, and WhatsApp.
*   **SHA256 Integrity**: Every skill or binary is hash-verified. Tampered artifacts refuse to run.
*   **Fork-Bomb Prevention**: Linux `cgroups` limit process counts, memory, and CPU to prevent resource exhaustion.
*   **Skills Marketplace**: A vetted hub for installing sandboxed agent capabilities safely.

## 5. Technology Stack
*   **Backend**: Rust, Node.js, Python.
*   **Security**: Landlock, seccomp, NetNS, Cgroups.
*   **Frontend**: Next.js (React), Tailwind CSS v4, Lucide Icons.
*   **Networking**: Caddy, OpenShell.

---

## Conclusion
Diffract is designed to be the "Safe Operating System" for AI agents. By enforcing security at the kernel level rather than the application level, it provides a robust foundation for building autonomous systems that are both powerful and auditable.
