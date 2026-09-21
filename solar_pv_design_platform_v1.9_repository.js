"use strict";

(function initSolarPVRepository(global) {
  function requireFunction(value, label) {
    if (typeof value !== "function") {
      throw new Error(`${label} must be a function.`);
    }

    return value;
  }

  function createBrowserLocalStorageProjectRepository(options = {}) {
    const storage =
      options.storage ||
      global.localStorage;

    if (!storage) {
      throw new Error(
        "Browser repository requires a Storage-compatible adapter."
      );
    }

    const projectStorageKey =
      String(options.projectStorageKey || "");

    const legacyProjectStorageKeys = [
      ...(options.legacyProjectStorageKeys || [])
    ];

    const revisionIndexKey =
      String(options.revisionIndexKey || "");

    const legacyRevisionIndexKeys = [
      ...(options.legacyRevisionIndexKeys || [])
    ];

    const revisionKeyPrefix =
      String(options.revisionKeyPrefix || "");

    const legacyRevisionKeyPrefixes = [
      ...(options.legacyRevisionKeyPrefixes || [])
    ];

    const maxRevisions =
      Math.max(
        1,
        Number(options.maxRevisions) || 8
      );

    const getModulePowerW =
      typeof options.getModulePowerW === "function"
        ? options.getModulePowerW
        : () => 0;

    const parseRevisionIndexRaw =
      requireFunction(
        options.parseRevisionIndexRaw,
        "parseRevisionIndexRaw"
      );

    const getRevisionStorageKey =
      requireFunction(
        options.getRevisionStorageKey,
        "getRevisionStorageKey"
      );

    function readRevisionIndex() {
      const currentRaw =
        storage.getItem(revisionIndexKey);

      if (currentRaw) {
        return parseRevisionIndexRaw(currentRaw);
      }

      for (const legacyKey of legacyRevisionIndexKeys) {
        const raw =
          storage.getItem(legacyKey);

        if (raw) {
          return parseRevisionIndexRaw(
            raw,
            "Legacy browser revision index"
          );
        }
      }

      return [];
    }

    function writeRevisionIndex(index) {
      storage.setItem(
        revisionIndexKey,
        JSON.stringify(index)
      );
    }

    return Object.freeze({
      adapterName:
        "BrowserLocalStorageProjectRepository",

      loadCurrentRaw() {
        let raw =
          storage.getItem(projectStorageKey);

        if (raw) {
          return {
            raw,
            sourceKey: projectStorageKey
          };
        }

        for (const legacyKey of legacyProjectStorageKeys) {
          raw =
            storage.getItem(legacyKey);

          if (raw) {
            return {
              raw,
              sourceKey: legacyKey
            };
          }
        }

        return {
          raw: null,
          sourceKey: null
        };
      },

      saveCurrent(snapshot) {
        storage.setItem(
          projectStorageKey,
          JSON.stringify(snapshot)
        );
      },

      commitRevision(snapshot) {
        const projectId =
          String(snapshot?.projectId || "");

        const revisionNumber =
          Number(snapshot?.revisionNumber);

        if (
          !projectId ||
          !Number.isInteger(revisionNumber) ||
          revisionNumber < 1
        ) {
          throw new Error(
            "Revision snapshot lacks a valid project ID or revision number."
          );
        }

        const key =
          getRevisionStorageKey(
            projectId,
            revisionNumber,
            revisionKeyPrefix
          );

        const existingRaw =
          storage.getItem(key);

        if (existingRaw) {
          const existing =
            JSON.parse(existingRaw);

          const existingFingerprint =
            String(
              existing?.stateFingerprint ||
              ""
            );

          if (
            !existingFingerprint ||
            existingFingerprint !==
              String(snapshot.stateFingerprint || "")
          ) {
            throw new Error(
              `Immutable local revision conflict for ${projectId} Revision ${revisionNumber}. Existing fingerprint ${existingFingerprint || "missing"}; incoming ${snapshot.stateFingerprint || "missing"}.`
            );
          }
        } else {
          storage.setItem(
            key,
            JSON.stringify(snapshot)
          );
        }

        let index =
          readRevisionIndex().filter(
            item =>
              !(
                item.projectId === projectId &&
                Number(item.revisionNumber) === revisionNumber
              )
          );

        const modulePowerW =
          Number(
            getModulePowerW(
              snapshot?.form?.panel
            )
          ) || 0;

        const panelCount =
          Number(
            snapshot?.layout?.panels?.length ||
            0
          );

        index.push({
          projectId,
          revisionNumber,
          savedAt:
            snapshot.savedAt,
          stateFingerprint:
            snapshot.stateFingerprint,
          parentRevisionFingerprint:
            snapshot.parentRevisionFingerprint ||
            null,
          installation:
            snapshot.installation ||
            "Rooftop Solar",
          panelCount,
          dcKW:
            panelCount *
            modulePowerW /
            1000
        });

        const projectRows =
          index
            .filter(
              item =>
                item.projectId === projectId
            )
            .sort(
              (a, b) =>
                Number(b.revisionNumber) -
                Number(a.revisionNumber)
            );

        const keepProjectRows =
          projectRows.slice(
            0,
            maxRevisions
          );

        const keepNumbers =
          new Set(
            keepProjectRows.map(
              item =>
                Number(item.revisionNumber)
            )
          );

        projectRows
          .slice(maxRevisions)
          .forEach(item =>
            storage.removeItem(
              getRevisionStorageKey(
                projectId,
                item.revisionNumber,
                revisionKeyPrefix
              )
            )
          );

        index =
          index.filter(
            item =>
              item.projectId !== projectId ||
              keepNumbers.has(
                Number(item.revisionNumber)
              )
          );

        index.sort(
          (a, b) =>
            String(a.projectId).localeCompare(
              String(b.projectId)
            ) ||
            Number(b.revisionNumber) -
              Number(a.revisionNumber)
        );

        writeRevisionIndex(index);

        this.saveCurrent(snapshot);

        return snapshot;
      },

      listRevisions(projectId) {
        return readRevisionIndex()
          .filter(
            item =>
              item.projectId === projectId
          )
          .sort(
            (a, b) =>
              Number(b.revisionNumber) -
              Number(a.revisionNumber)
          );
      },

      loadRevision(
        projectId,
        revisionNumber
      ) {
        let raw =
          storage.getItem(
            getRevisionStorageKey(
              projectId,
              revisionNumber,
              revisionKeyPrefix
            )
          );

        if (raw) {
          return raw;
        }

        for (const prefix of legacyRevisionKeyPrefixes) {
          raw =
            storage.getItem(
              getRevisionStorageKey(
                projectId,
                revisionNumber,
                prefix
              )
            );

          if (raw) {
            return raw;
          }
        }

        return null;
      },

      readRevisionIndex
    });
  }

  function createHttpProjectRepository(options = {}) {
    const sanitizeBaseUrl =
      requireFunction(
        options.sanitizeBaseUrl,
        "sanitizeBaseUrl"
      );

    const verifySnapshotFingerprint =
      requireFunction(
        options.verifySnapshotFingerprint,
        "verifySnapshotFingerprint"
      );

    const fetchImpl =
      typeof options.fetchImpl === "function"
        ? options.fetchImpl
        : (...args) =>
            global.fetch(...args);

    const AbortControllerImpl =
      options.AbortControllerImpl ||
      global.AbortController;

    const setTimer =
      options.setTimeoutImpl ||
      global.setTimeout.bind(global);

    const clearTimer =
      options.clearTimeoutImpl ||
      global.clearTimeout.bind(global);

    async function fetchWithTimeout(
      url,
      requestOptions = {},
      timeoutMs = 10000
    ) {
      if (!AbortControllerImpl) {
        return fetchImpl(
          url,
          {
            ...requestOptions,
            credentials: "same-origin"
          }
        );
      }

      const controller =
        new AbortControllerImpl();

      const timer =
        setTimer(
          () => controller.abort(),
          timeoutMs
        );

      try {
        return await fetchImpl(
          url,
          {
            ...requestOptions,
            signal:
              controller.signal,
            credentials:
              "same-origin"
          }
        );
      } catch (error) {
        if (
          error?.name ===
          "AbortError"
        ) {
          throw new Error(
            `Remote repository request timed out after ${timeoutMs} ms.`
          );
        }

        throw error;
      } finally {
        clearTimer(timer);
      }
    }

    async function readRemoteResponseText(
      response,
      action
    ) {
      const text =
        await response.text();

      if (!response.ok) {
        throw new Error(
          `${action} failed with HTTP ${response.status}${
            text
              ? `: ${text.slice(0, 240)}`
              : "."
          }`
        );
      }

      return text;
    }

    function parseRemoteSnapshotPayload(text) {
      const parsed =
        JSON.parse(
          String(text || "{}")
        );

      const snapshot =
        parsed?.snapshot &&
        typeof parsed.snapshot === "object"
          ? parsed.snapshot
          : parsed;

      if (
        !snapshot ||
        typeof snapshot !== "object" ||
        Array.isArray(snapshot)
      ) {
        throw new Error(
          "Remote repository response did not contain a project snapshot object."
        );
      }

      return snapshot;
    }

    return Object.freeze({
      adapterName:
        "HttpProjectRepository",

      async healthCheck(settings) {
        const baseUrl =
          sanitizeBaseUrl(
            settings.baseUrl
          );

        if (!baseUrl) {
          throw new Error(
            "Enter a remote API base URL first."
          );
        }

        const response =
          await fetchWithTimeout(
            `${baseUrl}/health`,
            {
              method: "GET",
              headers: {
                "Accept":
                  "application/json"
              }
            },
            settings.timeoutMs
          );

        const text =
          await readRemoteResponseText(
            response,
            "Remote health check"
          );

        let detail =
          "reachable";

        let payload =
          null;

        if (text) {
          try {
            payload =
              JSON.parse(text);

            detail =
              payload?.status ||
              payload?.message ||
              detail;
          } catch {
            detail =
              text.slice(0, 120);
          }
        }

        return {
          ok: true,
          detail: String(detail),
          payload
        };
      },

      async commitRevision(
        snapshot,
        settings
      ) {
        verifySnapshotFingerprint(
          snapshot
        );

        const baseUrl =
          sanitizeBaseUrl(
            settings.baseUrl
          );

        if (!baseUrl) {
          throw new Error(
            "Enter a remote API base URL first."
          );
        }

        const projectId =
          encodeURIComponent(
            snapshot.projectId
          );

        const response =
          await fetchWithTimeout(
            `${baseUrl}/projects/${projectId}/revisions`,
            {
              method: "POST",
              headers: {
                "Accept":
                  "application/json",
                "Content-Type":
                  "application/json",
                "X-PV-Project-Fingerprint":
                  snapshot.stateFingerprint
              },
              body:
                JSON.stringify(snapshot)
            },
            settings.timeoutMs
          );

        const text =
          await readRemoteResponseText(
            response,
            "Remote revision commit"
          );

        if (text) {
          try {
            const result =
              JSON.parse(text);

            const remoteFingerprint =
              String(
                result?.stateFingerprint ||
                result?.snapshot
                  ?.stateFingerprint ||
                ""
              );

            if (
              remoteFingerprint &&
              remoteFingerprint !==
                snapshot.stateFingerprint
            ) {
              throw new Error(
                `Remote commit returned fingerprint ${remoteFingerprint}, expected ${snapshot.stateFingerprint}.`
              );
            }
          } catch (error) {
            if (
              error instanceof
              SyntaxError
            ) {
              return {
                ok: true
              };
            }

            throw error;
          }
        }

        return {
          ok: true
        };
      },

      async loadCurrentRaw(
        projectId,
        settings
      ) {
        const baseUrl =
          sanitizeBaseUrl(
            settings.baseUrl
          );

        if (!baseUrl) {
          throw new Error(
            "Enter a remote API base URL first."
          );
        }

        const response =
          await fetchWithTimeout(
            `${baseUrl}/projects/${encodeURIComponent(
              projectId
            )}/current`,
            {
              method: "GET",
              headers: {
                "Accept":
                  "application/json"
              }
            },
            settings.timeoutMs
          );

        const text =
          await readRemoteResponseText(
            response,
            "Remote current-project load"
          );

        const snapshot =
          parseRemoteSnapshotPayload(text);

        return {
          raw:
            JSON.stringify(snapshot),
          snapshot
        };
      },

      async listRevisions(
        projectId,
        settings
      ) {
        const baseUrl =
          sanitizeBaseUrl(
            settings.baseUrl
          );

        if (!baseUrl) {
          throw new Error(
            "Enter a remote API base URL first."
          );
        }

        const response =
          await fetchWithTimeout(
            `${baseUrl}/projects/${encodeURIComponent(
              projectId
            )}/revisions`,
            {
              method: "GET",
              headers: {
                "Accept":
                  "application/json"
              }
            },
            settings.timeoutMs
          );

        const text =
          await readRemoteResponseText(
            response,
            "Remote revision-list load"
          );

        const parsed =
          JSON.parse(
            text || "[]"
          );

        return Array.isArray(parsed)
          ? parsed
          : (
            Array.isArray(parsed?.revisions)
              ? parsed.revisions
              : []
          );
      },

      async loadRevision(
        projectId,
        revisionNumber,
        settings
      ) {
        const baseUrl =
          sanitizeBaseUrl(
            settings.baseUrl
          );

        if (!baseUrl) {
          throw new Error(
            "Enter a remote API base URL first."
          );
        }

        const response =
          await fetchWithTimeout(
            `${baseUrl}/projects/${encodeURIComponent(
              projectId
            )}/revisions/${Number(
              revisionNumber
            )}`,
            {
              method: "GET",
              headers: {
                "Accept":
                  "application/json"
              }
            },
            settings.timeoutMs
          );

        const text =
          await readRemoteResponseText(
            response,
            "Remote revision load"
          );

        const snapshot =
          parseRemoteSnapshotPayload(text);

        return {
          raw:
            JSON.stringify(snapshot),
          snapshot
        };
      }
    });
  }

  global.SolarPVRepository =
    Object.freeze({
      createBrowserLocalStorageProjectRepository,
      createHttpProjectRepository
    });
})(globalThis);
