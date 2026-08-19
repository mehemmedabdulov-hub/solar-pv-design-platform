"use strict";

const SOLAR_PV_WORKER_VERSION =
  "1.7.0";

function summarizePointCloudTask(payload) {
  const pointCount =
    Math.max(
      0,
      Math.floor(
        Number(payload?.pointCount) ||
        0
      )
    );

  const cell =
    Math.max(
      0.5,
      Number(payload?.cell) ||
      5
    );

  const ground =
    Number(payload?.ground) ||
    0;

  const minHeight =
    Math.max(
      0,
      Number(payload?.minHeight) ||
      0
    );

  const maxDistanceM =
    Math.max(
      1,
      Number(payload?.maxDistanceM) ||
      5000
    );

  const maxObstructions =
    Math.max(
      1,
      Math.floor(
        Number(payload?.maxObstructions) ||
        2000
      )
    );

  const coordinates =
    payload?.coordinates instanceof ArrayBuffer
      ? new Float64Array(
          payload.coordinates
        )
      : new Float64Array(0);

  if (
    coordinates.length <
    pointCount * 3
  ) {
    throw new Error(
      "Worker point buffer is shorter than the declared point count."
    );
  }

  const cells =
    new Map();

  let belowHeight = 0;
  let outOfRange = 0;

  for (
    let index = 0;
    index < pointCount;
    index += 1
  ) {
    const offset =
      index * 3;

    const x =
      coordinates[offset];

    const y =
      coordinates[offset + 1];

    const z =
      coordinates[offset + 2];

    if (
      ![x, y, z].every(
        Number.isFinite
      )
    ) {
      continue;
    }

    if (
      Math.hypot(x, y) >
      maxDistanceM
    ) {
      outOfRange += 1;
      continue;
    }

    const height =
      z - ground;

    if (
      height < minHeight
    ) {
      belowHeight += 1;
      continue;
    }

    const ix =
      Math.floor(
        x / cell
      );

    const iy =
      Math.floor(
        y / cell
      );

    const key =
      `${ix}:${iy}`;

    let record =
      cells.get(key);

    if (!record) {
      record = {
        ix,
        iy,
        sumX: 0,
        sumY: 0,
        count: 0,
        maxHeight:
          -Infinity
      };

      cells.set(
        key,
        record
      );
    }

    record.sumX += x;
    record.sumY += y;
    record.count += 1;

    record.maxHeight =
      Math.max(
        record.maxHeight,
        height
      );
  }

  let records =
    [...cells.values()].map(
      record => ({
        cellX:
          record.ix,

        cellY:
          record.iy,

        eastM:
          record.sumX /
          record.count,

        northM:
          record.sumY /
          record.count,

        heightM:
          record.maxHeight,

        radiusM:
          cell *
          Math.SQRT2 /
          2,

        coveragePct:
          Math.min(
            70,
            15 +
              8 *
                Math.log2(
                  record.count +
                  1
                )
          ),

        pointCount:
          record.count
      })
    );

  let truncated =
    false;

  if (
    records.length >
    maxObstructions
  ) {
    truncated =
      true;

    records.sort(
      (a, b) =>
        b.heightM -
          a.heightM ||
        b.pointCount -
          a.pointCount ||
        a.cellY -
          b.cellY ||
        a.cellX -
          b.cellX
    );

    records =
      records.slice(
        0,
        maxObstructions
      );
  }

  records.sort(
    (a, b) =>
      a.cellY -
        b.cellY ||
      a.cellX -
        b.cellX
  );

  return {
    records,
    truncated,
    cells:
      cells.size,
    belowHeight,
    outOfRange
  };
}

self.onmessage =
  event => {
    const message =
      event?.data || {};

    const id =
      message.id;

    const task =
      String(
        message.task ||
        ""
      );

    try {
      let result;

      if (
        task === "ping"
      ) {
        result = {
          pong: true,
          workerVersion:
            SOLAR_PV_WORKER_VERSION
        };
      } else if (
        task ===
        "summarize-point-cloud"
      ) {
        result =
          summarizePointCloudTask(
            message.payload ||
            {}
          );
      } else {
        throw new Error(
          `Unsupported deterministic worker task '${task}'.`
        );
      }

      self.postMessage({
        id,
        ok: true,
        task,
        workerVersion:
          SOLAR_PV_WORKER_VERSION,
        result
      });
    } catch (error) {
      self.postMessage({
        id,
        ok: false,
        task,
        workerVersion:
          SOLAR_PV_WORKER_VERSION,
        error:
          error?.message ||
          String(error)
      });
    }
  };
  