PKG_NAME := nginx-oidc-njs
BUNDLE_NAME := nginx-oidc.njs
TARBALL_NAME := $(PKG_NAME)-$(VERSION)

NGINX_VERSION ?= 1.22.x

prefix := $(or $(prefix),$(PREFIX),/usr/local)
datadir := $(prefix)/share

GIT := git
INSTALL := install
NPM := npm
SED := sed
TAR := tar
SHA256SUM := sha256sum

GIT_REV := $(shell test -d .git && $(GIT) describe --tags --match 'v*' 2>/dev/null)
ifneq ($(GIT_REV),)
  VERSION := $(patsubst v%,%,$(GIT_REV))
endif

MAKEFILE_PATH = $(lastword $(MAKEFILE_LIST))


all: build

#: Print list of targets.
help:
	@printf '%s\n\n' 'List of targets:'
	@$(SED) -En '/^#:.*/{ N; s/^#: (.*)\n([A-Za-z0-9_-]+).*/\2 \1/p }' $(MAKEFILE_PATH) \
		| while read label desc; do printf '%-15s %s\n' "$$label" "$$desc"; done

.PHONY: help


#: Install npm dependencies.
deps: node_modules

#: Build bundle (the default target).
build: dist/$(BUNDLE_NAME)

#: Run integration tests with nginx $NGINX_VERSION.
test: build
	NGINX_VERSION=$(NGINX_VERSION) $(NPM) run test-only

#: Run type check.
lint: deps
	$(NPM) run lint

#: Remove generated files and node_modules.
clean:
	rm -rf dist lib node_modules

.PHONY: deps build test lint clean


#: Install into $DESTDIR.
install: build
	$(INSTALL) -d "$(DESTDIR)$(datadir)/$(PKG_NAME)/conf"
	$(INSTALL) -m644 dist/$(BUNDLE_NAME) "$(DESTDIR)$(datadir)/$(PKG_NAME)/$(BUNDLE_NAME)"
	$(INSTALL) -m644 conf/* -t "$(DESTDIR)$(datadir)/$(PKG_NAME)/conf"

#: Uninstall from $DESTDIR.
uninstall:
	rm -rf "$(DESTDIR)$(datadir)/$(PKG_NAME)"

.PHONY: install uninstall


#: Update version in README.adoc to $VERSION.
bump-version:
	test -n "$(VERSION)"  # $$VERSION
	$(SED) -E -i "s/^(:version:).*/\1 $(VERSION)/" README.adoc

#: Bump version to $VERSION, create release commit and tag.
release: .check-git-clean | bump-version
	$(GIT) commit --allow-empty -m "Release version $(VERSION)"
	$(GIT) tag -s v$(VERSION) -m v$(VERSION)

#: Create release tarball.
tarball: dist/$(TARBALL_NAME).tar.gz

.PHONY: bump-version release tarball


.check-git-clean:
	@test -z "$(shell $(GIT) status --porcelain)" \
		|| { echo 'You have uncommitted changes!' >&2; exit 1; }

.PHONY: .check-git-clean


node_modules: package.json package-lock.json
	$(NPM) clean-install

dist/$(BUNDLE_NAME): node_modules
	$(NPM) run build

dist/$(TARBALL_NAME).tar.gz: dist/$(BUNDLE_NAME)
	test -n "$(VERSION)"  # $$VERSION
	mkdir -p dist/$(TARBALL_NAME)
	cp -r conf dist/$(BUNDLE_NAME) LICENSE README.adoc dist/$(TARBALL_NAME)/
	$(TAR) -C dist -czf dist/$(TARBALL_NAME).tar.gz $(TARBALL_NAME)
	cd dist && $(SHA256SUM) $(TARBALL_NAME).tar.gz > $(TARBALL_NAME).tar.gz.sha256
	rm -rf "dist/$(TARBALL_NAME)"
