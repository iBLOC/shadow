#!/bin/bash
# Shadow System Startup Check Script
# Checks all prerequisites for Resonance, Prefrontal, and Hippocampus

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project roots
RESONANCE_DIR="/home/ibloc/Projects/resonance"
PREFRONTAL_DIR="/home/ibloc/Projects/prefrontal"
HIPPOCAMPUS_DIR="/home/ibloc/Projects/hippocampus"

# Ports
RESONANCE_PORT=8080
PREFRONTAL_PORT=3000
HIPPOCAMPUS_PORT=8080

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}          Shadow System Startup Check${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Track overall status
ERRORS=0
WARNINGS=0

# ─────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────

check_port() {
    local port=$1
    local service=$2
    if ss -tlnp 2>/dev/null | grep -q ":$port "; then
        echo -e "  ${GREEN}✓${NC} Port $port ($service) is LISTENING"
        return 0
    elif netstat -tlnp 2>/dev/null | grep -q ":$port "; then
        echo -e "  ${GREEN}✓${NC} Port $port ($service) is LISTENING"
        return 0
    else
        echo -e "  ${RED}✗${NC} Port $port ($service) is NOT in use"
        return 1
    fi
}

check_env() {
    local var=$1
    local desc=$2
    local default=$3
    local value="${!var}"
    if [ -z "$value" ]; then
        if [ -n "$default" ]; then
            echo -e "  ${YELLOW}⚠${NC} $var not set, using default: $default"
            WARNINGS=$((WARNINGS + 1))
        else
            echo -e "  ${RED}✗${NC} $var not set ($desc)"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e "  ${GREEN}✓${NC} $var=$value"
    fi
}

check_process() {
    local name=$1
    local pattern=${2:-$name}
    if pgrep -f "$pattern" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $name process is running"
        return 0
    else
        echo -e "  ${YELLOW}⚠${NC} $name process not found"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────
# Section 1: Docker Status
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}  Docker Status${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

if docker info > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Docker daemon is accessible"
    DOCKER_OK=1
else
    echo -e "  ${RED}✗${NC} Docker daemon not accessible (permission denied?)"
    echo -e "     Run: sudo usermod -aG docker \$USER && newgrp docker"
    DOCKER_OK=0
    ERRORS=$((ERRORS + 1))
fi

if [ $DOCKER_OK -eq 1 ]; then
    echo -e "  ${GREEN}✓${NC} Docker is available for hippocampus docker-compose"
fi
echo ""

# ─────────────────────────────────────────────────────────────────
# Section 2: PostgreSQL Status
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}  PostgreSQL Status${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

# Check if PostgreSQL is running
if check_process "postgres" "postgres:"; then
    PG_OK=1
else
    # Try to detect with pg_isready
    if command -v pg_isready > /dev/null 2>&1; then
        if pg_isready -q 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} PostgreSQL is accepting connections"
            PG_OK=1
        else
            echo -e "  ${RED}✗${NC} PostgreSQL is not accepting connections"
            PG_OK=0
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Cannot verify PostgreSQL (pg_isready not installed)"
        PG_OK=0
        WARNINGS=$((WARNINGS + 1))
    fi
fi

# Check databases
if [ $PG_OK -eq 1 ]; then
    echo ""
    echo "  Checking required databases..."
    
    for db in "resonance" "hippocampus"; do
        if command -v psql > /dev/null 2>&1; then
            if PGPASSWORD=postgres psql -U postgres -h localhost -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$db"; then
                echo -e "    ${GREEN}✓${NC} Database '$db' exists"
            else
                echo -e "    ${RED}✗${NC} Database '$db' does NOT exist"
                echo -e "         Run: PGPASSWORD=postgres psql -U postgres -h localhost -c 'CREATE DATABASE $db;'"
                ERRORS=$((ERRORS + 1))
            fi
        fi
    done
fi
echo ""

# ─────────────────────────────────────────────────────────────────
# Section 3: Port Availability
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}  Port Availability${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

for port_info in "$RESONANCE_PORT:Resonance" "$PREFRONTAL_PORT:Prefrontal" "$HIPPOCAMPUS_PORT:Hippocampus"; do
    port="${port_info%%:*}"
    name="${port_info##*:}"
    if ss -tlnp 2>/dev/null | grep -q ":$port "; then
        echo -e "  ${RED}✗${NC} Port $port ($name) - ALREADY IN USE"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "  ${GREEN}✓${NC} Port $port ($name) - available"
    fi
done
echo ""

# ─────────────────────────────────────────────────────────────────
# Section 4: Environment Variables
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}  Environment Variables${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

echo "  [Resonance]"
check_env "DATABASE_URL" "PostgreSQL connection" "postgresql://postgres:postgres@localhost:5432/resonance"

echo ""
echo "  [Prefrontal]"
check_env "OPENAI_API_KEY" "LLM API key (optional for basic mode)" ""

echo ""
echo "  [Hippocampus]"
check_env "EMBEDDING_API_KEY" "OpenAI API key for embeddings" ""
echo ""

# ─────────────────────────────────────────────────────────────────
# Section 5: Project Directories
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}  Project Directories${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

for dir_info in "$RESONANCE_DIR:Resonance" "$PREFRONTAL_DIR:Prefrontal" "$HIPPOCAMPUS_DIR:Hippocampus"; do
    dir="${dir_info%%:*}"
    name="${dir_info##*:}"
    if [ -d "$dir" ]; then
        echo -e "  ${GREEN}✓${NC} $name: $dir"
    else
        echo -e "  ${RED}✗${NC} $name: $dir (NOT FOUND)"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# ─────────────────────────────────────────────────────────────────
# Section 6: Rust Toolchain
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}  Rust Toolchain${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

if command -v cargo > /dev/null 2>&1; then
    cargo_version=$(cargo --version 2>/dev/null || echo "unknown")
    rustc_version=$(rustc --version 2>/dev/null || echo "unknown")
    echo -e "  ${GREEN}✓${NC} Cargo: $cargo_version"
    echo -e "  ${GREEN}✓${NC} Rust: $rustc_version"
else
    echo -e "  ${RED}✗${NC} Cargo not found - Rust toolchain not installed"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# ─────────────────────────────────────────────────────────────────
# Section 7: Service Start Commands
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
echo -e "${BLUE}  Service Start Commands${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"

echo -e "  ${GREEN}Resonance:${NC}"
echo -e "    cd $RESONANCE_DIR/server && cargo run"
echo -e "    # Or with custom DATABASE_URL:"
echo -e "    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/resonance cargo run"
echo ""

echo -e "  ${GREEN}Prefrontal:${NC}"
echo -e "    cd $PREFRONTAL_DIR && cargo run -- serve"
echo -e "    # With custom port:"
echo -e "    cargo run -- serve --addr 0.0.0.0:8082"
echo ""

echo -e "  ${GREEN}Hippocampus:${NC}"
echo -e "    cd $HIPPOCAMPUS_DIR && EMBEDDING_API_KEY=your-key cargo run -p hippocampus-server"
echo -e "    # Or using docker-compose:"
echo -e "    cd $HIPPOCAMPUS_DIR && docker-compose up"
echo ""

# ─────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "  ${GREEN}✓ All checks passed!${NC}"
    echo -e "  Services should start correctly."
elif [ $ERRORS -eq 0 ]; then
    echo -e "  ${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    echo -e "  Services may start but with limited functionality."
else
    echo -e "  ${RED}✗ $ERRORS error(s), $WARNINGS warning(s) found${NC}"
    echo -e "  Please fix the errors before starting services."
fi
echo ""

# ─────────────────────────────────────────────────────────────────
# Quick Start Option
# ─────────────────────────────────────────────────────────────────

if [ $ERRORS -eq 0 ]; then
    echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
    echo -e "${BLUE}  Quick Start${NC}"
    echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo "  Run all services in separate terminals:"
    echo ""
    echo "  Terminal 1 - Resonance:"
    echo -e "    ${GREEN}cd $RESONANCE_DIR/server && cargo run${NC}"
    echo ""
    echo "  Terminal 2 - Prefrontal:"
    echo -e "    ${GREEN}cd $PREFRONTAL_DIR && cargo run -- serve${NC}"
    echo ""
    echo "  Terminal 3 - Hippocampus:"
    echo -e "    ${GREEN}cd $HIPPOCAMPUS_DIR && EMBEDDING_API_KEY=your-key cargo run -p hippocampus-server${NC}"
    echo ""
fi

exit $ERRORS
