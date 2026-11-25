/**
 * Featured creator video carousel for home / promote surfaces.
 */

import { Link } from 'react-router-dom'
import { listApprovedVideos, listFeaturedVideos, getPartnerById } from '../utils/referralStore.js'

export default function CreatorVideoSpotlight({ limit = 6 }) {
  const featured = listFeaturedVideos()
  const approved = listApprovedVideos()
  const videos = (featured.length ? featured : approved).slice(0, limit)

  if (!videos.length) {
    return (
      <section className="card create-section tv-video-spotlight">
        <h2>Creator spotlight</h2>
        <p className="form-hint">
          Approved mentor and faculty videos will appear here. Promoters can submit links from{' '}
          <Link to="/earn">Earn & Refer</Link>.
        </p>
      </section>
    )
  }

  return (
    <section className="card create-section tv-video-spotlight" data-testid="creator-video-spotlight">
      <h2>Creator spotlight</h2>
      <p className="form-hint">
        Strategy videos from campus mentors and teachers — watch, then try 2 free mocks with their
        code (10% off).
      </p>
      <ul className="tv-video-grid">
        {videos.map((v) => {
          const partner = getPartnerById(v.partnerId)
          return (
            <li key={v.id} className="tv-video-card">
              <h3>{v.title}</h3>
              <p className="form-hint">
                {partner?.displayName || partner?.name || 'Creator'}
                {partner?.examCredentialBadge ? ` · ${partner.examCredentialBadge}` : ''}
                {partner?.collegeName ? ` · ${partner.collegeName}` : ''}
              </p>
              <div className="tv-inline-form">
                <Link className="btn btn-primary btn-sm" to={`/v/${v.videoTrackingSlug}`}>
                  Watch & claim 10% off
                </Link>
                {v.creatorChannelUrl ? (
                  <a
                    className="btn btn-ghost btn-sm"
                    href={v.creatorChannelUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Creator channel
                  </a>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
