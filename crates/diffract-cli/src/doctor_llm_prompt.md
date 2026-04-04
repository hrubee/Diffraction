<!-- Derived from .agents/skills/debug-diffract-cluster/SKILL.md -->
<!-- Keep in sync when updating cluster debug procedures -->

# Debug Diffract Gateway

You are diagnosing an Diffract gateway cluster. Use **only** `diffract` CLI commands (`diffract status`, `diffract doctor logs`, `diffract doctor exec`) to inspect and fix the cluster. Do **not** use raw `docker`, `ssh`, or `kubectl` commands directly — always go through the `diffract doctor` interface. The CLI auto-resolves local vs remote gateways, so the same commands work everywhere. Run diagnostics automatically through the steps below in order. Stop and report findings as soon as a root cause is identified.

## Tools Available

All diagnostics go through three `diffract` commands. They auto-resolve local vs remote gateways — the same commands work for both:

```bash
# Quick connectivity check (run this first)
diffract status

# Fetch container logs
diffract doctor logs --lines 100
diffract doctor logs --tail          # stream live

# Run any command inside the gateway container (KUBECONFIG is pre-configured)
diffract doctor exec -- kubectl get pods -A
diffract doctor exec -- kubectl -n diffract logs statefulset/diffract --tail=100
diffract doctor exec -- cat /etc/rancher/k3s/registries.yaml
diffract doctor exec -- df -h /
diffract doctor exec -- free -h
diffract doctor exec -- sh           # interactive shell
```

## Overview

`diffract gateway start` creates a Docker container running k3s with the Diffract server deployed via Helm. The deployment stages, in order, are:

1. **Pre-deploy check**: `diffract gateway start` in interactive mode prompts to **reuse** (keep volume, clean stale nodes) or **recreate** (destroy everything, fresh start). `mise run cluster` always recreates before deploy.
2. Ensure cluster image is available (local build or remote pull)
3. Create Docker network (`diffract-cluster`) and volume (`diffract-cluster-{name}`)
4. Create and start a privileged Docker container (`diffract-cluster-{name}`)
5. Wait for k3s to generate kubeconfig (up to 60s)
6. **Clean stale nodes**: Remove any `NotReady` k3s nodes left over from previous container instances that reused the same persistent volume
7. **Prepare local images** (if `OPENSHELL_PUSH_IMAGES` is set): In `internal` registry mode, bootstrap waits for the in-cluster registry and pushes tagged images there. In `external` mode, bootstrap uses legacy `ctr -n k8s.io images import` push-mode behavior.
8. **Reconcile TLS PKI**: Load existing TLS secrets from the cluster; if missing, incomplete, or malformed, generate fresh PKI (CA + server + client certs). Apply secrets to cluster. If rotation happened and the Diffract workload is already running, rollout restart and wait for completion (failed rollout aborts deploy).
9. **Store CLI mTLS credentials**: Persist client cert/key/CA locally for CLI authentication.
10. Wait for cluster health checks to pass (up to 6 min):
    - k3s API server readiness (`/readyz`)
    - `diffract` statefulset ready in `diffract` namespace
    - TLS secrets `diffract-server-tls` and `diffract-client-tls` exist in `diffract` namespace

For local deploys, metadata endpoint selection depends on Docker connectivity:

- default local Docker socket (`unix:///var/run/docker.sock`): `https://127.0.0.1:{port}` (default port 8080)
- TCP Docker daemon (`DOCKER_HOST=tcp://<host>:<port>`): `https://<host>:{port}` for non-loopback hosts

The host port is configurable via `--port` on `diffract gateway start` (default 8080) and is stored in `ClusterMetadata.gateway_port`.

The TCP host is also added as an extra gateway TLS SAN so mTLS hostname validation succeeds.

The default cluster name is `diffract`. The container is `diffract-cluster-{name}`.

## Workflow

### Determine Context

Before running commands, establish:

1. **Cluster name**: Default is `diffract`, giving container name `diffract-cluster-diffract`
2. **Remote or local**: The `diffract doctor` commands auto-resolve this from gateway metadata — no special flags needed for the active gateway
3. **Config directory**: `~/.config/diffract/gateways/{name}/`

### Step 0: Quick Connectivity Check

Run `diffract status` first. This immediately reveals:
- Which gateway and endpoint the CLI is targeting
- Whether the CLI can reach the server (mTLS handshake success/failure)
- The server version if connected

Common errors at this stage:
- **`tls handshake eof`**: The server isn't running or mTLS credentials are missing/mismatched
- **`connection refused`**: The container isn't running or port mapping is broken
- **`No gateway configured`**: No gateway has been deployed yet

### Step 1: Check Container Logs

Get recent container logs to identify startup failures:

```bash
diffract doctor logs --lines 100
```

Look for:

- DNS resolution failures in the entrypoint script
- k3s startup errors (certificate issues, port binding failures)
- Manifest copy errors from `/opt/diffract/manifests/`
- `iptables` or `cgroup` errors (privilege/capability issues)

### Step 2: Check k3s Cluster Health

Verify k3s itself is functional:

```bash
# API server readiness
diffract doctor exec -- kubectl get --raw="/readyz"

# Node status
diffract doctor exec -- kubectl get nodes -o wide

# All pods
diffract doctor exec -- kubectl get pods -A -o wide
```

If `/readyz` fails, k3s is still starting or has crashed. Check container logs (Step 1).

If pods are in `CrashLoopBackOff`, `ImagePullBackOff`, or `Pending`, investigate those pods specifically.

Also check for node pressure conditions that cause the kubelet to evict pods and reject scheduling:

```bash
# Check node conditions (DiskPressure, MemoryPressure, PIDPressure)
diffract doctor exec -- kubectl get nodes -o jsonpath="{range .items[*]}{.metadata.name}{range .status.conditions[*]} {.type}={.status}{end}{\"\n\"}{end}"

# Check disk usage inside the container
diffract doctor exec -- df -h /

# Check memory usage
diffract doctor exec -- free -h
```

If any pressure condition is `True`, pods will be evicted and new ones rejected. The bootstrap detects `HEALTHCHECK_NODE_PRESSURE` markers from the health-check script and aborts early with a clear diagnosis. To fix: free disk/memory on the host, then recreate the gateway.

### Step 3: Check Diffract Server StatefulSet

The Diffract server is deployed via a HelmChart CR as a StatefulSet named `diffract` in the `diffract` namespace. Check its status:

```bash
# StatefulSet status
diffract doctor exec -- kubectl -n diffract get statefulset/diffract -o wide

# Diffract pod logs
diffract doctor exec -- kubectl -n diffract logs statefulset/diffract --tail=100

# Describe statefulset for events
diffract doctor exec -- kubectl -n diffract describe statefulset/diffract

# Helm install job logs (the job that installs the Diffract chart)
diffract doctor exec -- kubectl -n kube-system logs -l job-name=helm-install-diffract --tail=200
```

Common issues:

- **Replicas 0/0**: The StatefulSet has been scaled to zero — no pods are running. This can happen after a failed deploy, manual scale-down, or Helm values misconfiguration. Fix: `diffract doctor exec -- kubectl -n diffract scale statefulset diffract --replicas=1`
- **ImagePullBackOff**: The component image failed to pull. In `internal` mode, verify internal registry readiness and pushed image tags (Step 5). In `external` mode, check `/etc/rancher/k3s/registries.yaml` credentials/endpoints and DNS (Step 8). Default external registry is `ghcr.io/nvidia/diffract/` (public, no auth required). If using a private registry, ensure `--registry-username` and `--registry-token` (or `OPENSHELL_REGISTRY_USERNAME`/`OPENSHELL_REGISTRY_TOKEN`) were provided during deploy.
- **CrashLoopBackOff**: The server is crashing. Check pod logs for the actual error.
- **Pending**: Insufficient resources or scheduling constraints.

### Step 4: Check Networking

The Diffract server is exposed via a NodePort service on port `30051`:

```bash
# Service status
diffract doctor exec -- kubectl -n diffract get service/diffract
```

Expected port: `30051/tcp` (mapped to configurable host port, default 8080; set via `--port` on deploy).

### Step 5: Check Image Availability

Component images (server, sandbox) can reach kubelet via two paths:

**Local/external pull mode** (default local via `mise run cluster`): Local images are tagged to the configured local registry base (default `127.0.0.1:5000/diffract/*`), pushed to that registry, and pulled by k3s via `registries.yaml` mirror endpoint (typically `host.docker.internal:5000`). The `cluster` task pushes prebuilt local tags (`diffract/*:dev`, falling back to `localhost:5000/diffract/*:dev` or `127.0.0.1:5000/diffract/*:dev`).

```bash
# Verify image refs currently used by diffract deployment
diffract doctor exec -- kubectl -n diffract get statefulset diffract -o jsonpath="{.spec.template.spec.containers[*].image}"

# Verify registry mirror/auth endpoint configuration
diffract doctor exec -- cat /etc/rancher/k3s/registries.yaml
```

**Legacy push mode**: Images are imported into the k3s containerd `k8s.io` namespace.

```bash
# Check if images were imported into containerd (k3s default namespace is k8s.io)
diffract doctor exec -- ctr -a /run/k3s/containerd/containerd.sock images ls | grep diffract
```

**External pull mode** (remote deploy, or local with `OPENSHELL_REGISTRY_HOST`/`IMAGE_REPO_BASE` pointing at a non-local registry): Images are pulled from an external registry at runtime. The entrypoint generates `/etc/rancher/k3s/registries.yaml`.

```bash
# Verify registries.yaml exists and has credentials
diffract doctor exec -- cat /etc/rancher/k3s/registries.yaml

# Test pulling an image manually from inside the cluster
diffract doctor exec -- crictl pull ghcr.io/nvidia/diffract/gateway:latest
```

If `registries.yaml` is missing or has wrong values, verify env wiring (`OPENSHELL_REGISTRY_HOST`, `OPENSHELL_REGISTRY_INSECURE`, username/password for authenticated registries).

### Step 6: Check mTLS / PKI

TLS certificates are generated by the `diffract-bootstrap` crate (using `rcgen`) and stored as K8s secrets before the Helm release installs. There is no PKI job or cert-manager — certificates are applied directly via `kubectl apply`.

```bash
# Check if the three TLS secrets exist
diffract doctor exec -- kubectl -n diffract get secret diffract-server-tls diffract-server-client-ca diffract-client-tls

# Inspect server cert expiry (if openssl is available in the container)
diffract doctor exec -- sh -c 'kubectl -n diffract get secret diffract-server-tls -o jsonpath="{.data.tls\.crt}" | base64 -d | openssl x509 -noout -dates 2>/dev/null || echo "openssl not available"'

# Check if CLI-side mTLS files exist locally
ls -la ~/.config/diffract/gateways/<name>/mtls/
```

On redeploy, bootstrap reuses existing secrets if they are valid PEM. If secrets are missing or malformed, fresh PKI is generated and the Diffract workload is automatically restarted. If the rollout restart fails after rotation, the deploy aborts and CLI-side certs are not updated. Certificates use rcgen defaults (effectively never expire).

If the local mTLS files are missing but the secrets exist in the cluster, you can extract them manually:

```bash
mkdir -p ~/.config/diffract/gateways/<name>/mtls
diffract doctor exec -- kubectl -n diffract get secret diffract-client-tls -o jsonpath='{.data.ca\.crt}' | base64 -d > ~/.config/diffract/gateways/<name>/mtls/ca.crt
diffract doctor exec -- kubectl -n diffract get secret diffract-client-tls -o jsonpath='{.data.tls\.crt}' | base64 -d > ~/.config/diffract/gateways/<name>/mtls/tls.crt
diffract doctor exec -- kubectl -n diffract get secret diffract-client-tls -o jsonpath='{.data.tls\.key}' | base64 -d > ~/.config/diffract/gateways/<name>/mtls/tls.key
```

Common mTLS issues:
- **Secrets missing**: The `diffract` namespace may not have been created yet (Helm controller race). Bootstrap waits up to 2 minutes for the namespace.
- **mTLS mismatch after manual secret deletion**: Delete all three secrets and redeploy — bootstrap will regenerate and restart the workload.
- **CLI can't connect after redeploy**: Check that `~/.config/diffract/gateways/<name>/mtls/` contains `ca.crt`, `tls.crt`, `tls.key` and that they were updated at deploy time.
- **Local mTLS files missing**: The gateway was deployed but CLI credentials weren't persisted (e.g., interrupted deploy). Extract from the cluster secret as shown above.

### Step 7: Check Kubernetes Events

Events catch scheduling failures, image pull errors, and resource issues:

```bash
diffract doctor exec -- kubectl get events -A --sort-by=.lastTimestamp | tail -n 50
```

Look for:

- `FailedScheduling` — resource constraints
- `ImagePullBackOff` / `ErrImagePull` — registry auth failure or DNS issue (check `/etc/rancher/k3s/registries.yaml`)
- `CrashLoopBackOff` — application crashes
- `OOMKilled` — memory limits too low
- `FailedMount` — volume issues

### Step 8: Check DNS Resolution

DNS misconfiguration is a common root cause, especially on remote/Linux hosts:

```bash
# Check the resolv.conf k3s is using
diffract doctor exec -- cat /etc/rancher/k3s/resolv.conf

# Test DNS resolution from inside the container
diffract doctor exec -- sh -c 'nslookup google.com || wget -q -O /dev/null http://google.com && echo "network ok" || echo "network unreachable"'
```

Check the entrypoint's DNS decision in the container logs:

```bash
diffract doctor logs --lines 20
```

The entrypoint script selects DNS resolvers in this priority:

1. Viable nameservers from `/etc/resolv.conf` (not loopback/link-local)
2. Docker `ExtServers` from `/etc/resolv.conf` comments
3. Host gateway IP (Docker Desktop only, `192.168.*`)
4. Fallback to `8.8.8.8` / `8.8.4.4`

If DNS is broken, all image pulls from the distribution registry will fail, as will pods that need external network access.

## Common Failure Patterns

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `tls handshake eof` from `diffract status` | Server not running or mTLS credentials missing/mismatched | Check StatefulSet replicas (Step 3) and mTLS files (Step 6) |
| StatefulSet `0/0` replicas | StatefulSet scaled to zero (failed deploy, manual scale-down, or Helm misconfiguration) | `diffract doctor exec -- kubectl -n diffract scale statefulset diffract --replicas=1` |
| Local mTLS files missing | Deploy was interrupted before credentials were persisted | Extract from cluster secret `diffract-client-tls` (Step 6) |
| Container not found | Image not built | `mise run docker:build:cluster` (local) or re-deploy (remote) |
| Container exited, OOMKilled | Insufficient memory | Increase host memory or reduce workload |
| Container exited, non-zero exit | k3s crash, port conflict, privilege issue | Check `diffract doctor logs` for details |
| `/readyz` fails | k3s still starting or crashed | Wait longer or check container logs for k3s errors |
| Diffract pods `Pending` | Insufficient CPU/memory for scheduling, or PVC not bound | `diffract doctor exec -- kubectl describe pod -n diffract` and `diffract doctor exec -- kubectl get pvc -n diffract` |
| Diffract pods `CrashLoopBackOff` | Server application error | `diffract doctor exec -- kubectl -n diffract logs statefulset/diffract` |
| Diffract pods `ImagePullBackOff` (push mode) | Images not imported or wrong containerd namespace | `diffract doctor exec -- ctr -a /run/k3s/containerd/containerd.sock -n k8s.io images ls` (Step 5) |
| Diffract pods `ImagePullBackOff` (pull mode) | Registry auth or DNS issue | `diffract doctor exec -- cat /etc/rancher/k3s/registries.yaml` and DNS (Step 8) |
| Image import fails | Corrupt tar stream or containerd not ready | Retry after k3s is fully started; check container logs |
| Push mode images not found by kubelet | Imported into wrong containerd namespace | Must use `k3s ctr -n k8s.io images import`, not `k3s ctr images import` |
| mTLS secrets missing | Bootstrap couldn't apply secrets (namespace not ready) | Check deploy logs and verify `diffract` namespace exists (Step 6) |
| mTLS mismatch after redeploy | PKI rotated but workload not restarted, or rollout failed | Check that all three TLS secrets exist and that the diffract pod restarted after cert rotation (Step 6) |
| Helm install job failed | Chart values error or dependency issue | `diffract doctor exec -- kubectl -n kube-system logs -l job-name=helm-install-diffract` |
| Architecture mismatch (remote) | Built on arm64, deploying to amd64 | Cross-build the image for the target architecture |
| Port conflict | Another service on the configured gateway host port (default 8080) | Stop conflicting service or use `--port` on `diffract gateway start` to pick a different host port |
| gRPC connect refused to `127.0.0.1:443` in CI | Docker daemon is remote (`DOCKER_HOST=tcp://...`) but metadata still points to loopback | Verify metadata endpoint host matches `DOCKER_HOST` and includes non-loopback host |
| DNS failures inside container | Entrypoint DNS detection failed | `diffract doctor exec -- cat /etc/rancher/k3s/resolv.conf` and `diffract doctor logs --lines 20` |
| Node DiskPressure / MemoryPressure / PIDPressure | Insufficient disk, memory, or PIDs on host | Free disk (`docker system prune -a --volumes`), increase memory, or expand host resources |
| Pods evicted with "The node had condition: [DiskPressure]" | Host disk full, kubelet evicting pods | Free disk space on host, then `diffract gateway destroy <name> && diffract gateway start` |
| `metrics-server` errors in logs | Normal k3s noise, not the root cause | These errors are benign — look for the actual failing health check component |
| Stale NotReady nodes from previous deploys | Volume reused across container recreations | Deploy flow auto-cleans stale nodes; if it still fails, manually delete NotReady nodes or choose "Recreate" when prompted |
| gRPC `UNIMPLEMENTED` for newer RPCs in push mode | Helm values still point at older pulled images instead of the pushed refs | Verify rendered `diffract-helmchart.yaml` uses the expected push refs (`server`, `sandbox`, `pki-job`) and not `:latest` |

## Full Diagnostic Dump

Run all diagnostics at once for a comprehensive report:

```bash
echo "=== Connectivity Check ==="
diffract status

echo "=== Container Logs (last 50 lines) ==="
diffract doctor logs --lines 50

echo "=== k3s Readiness ==="
diffract doctor exec -- kubectl get --raw='/readyz'

echo "=== Nodes ==="
diffract doctor exec -- kubectl get nodes -o wide

echo "=== Node Conditions ==="
diffract doctor exec -- kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{range .status.conditions[*]} {.type}={.status}{end}{"\n"}{end}'

echo "=== Disk Usage ==="
diffract doctor exec -- df -h /

echo "=== All Pods ==="
diffract doctor exec -- kubectl get pods -A -o wide

echo "=== Failing Pods ==="
diffract doctor exec -- kubectl get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded

echo "=== Diffract StatefulSet ==="
diffract doctor exec -- kubectl -n diffract get statefulset/diffract -o wide

echo "=== Diffract Service ==="
diffract doctor exec -- kubectl -n diffract get service/diffract

echo "=== TLS Secrets ==="
diffract doctor exec -- kubectl -n diffract get secret diffract-server-tls diffract-server-client-ca diffract-client-tls

echo "=== Recent Events ==="
diffract doctor exec -- kubectl get events -A --sort-by=.lastTimestamp | tail -n 50

echo "=== Helm Install Diffract Logs ==="
diffract doctor exec -- kubectl -n kube-system logs -l job-name=helm-install-diffract --tail=100

echo "=== Registry Configuration ==="
diffract doctor exec -- cat /etc/rancher/k3s/registries.yaml

echo "=== DNS Configuration ==="
diffract doctor exec -- cat /etc/rancher/k3s/resolv.conf
```
