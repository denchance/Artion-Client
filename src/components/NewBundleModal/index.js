import React, { useEffect, useRef, useState, Suspense } from 'react';
import { useSelector } from 'react-redux';
import cx from 'classnames';
import { ClipLoader } from 'react-spinners';
import Modal from '@material-ui/core/Modal';
import Skeleton from 'react-loading-skeleton';
import Loader from 'react-loader-spinner';
import { ethers } from 'ethers';
import { useWeb3React } from '@web3-react/core';

import SuspenseImg from 'components/SuspenseImg';
import { createBundle, deleteBundle } from 'api';
import {
  listBundle,
  getNFTContract,
  BUNDLE_SALES_CONTRACT_ADDRESS,
} from 'contracts';
import toast from 'utils/toast';

import styles from './styles.module.scss';

const NFTItem = ({ item, loading, selected, onClick }) => {
  return (
    <div
      className={cx(styles.item, selected && styles.selected)}
      onClick={onClick}
    >
      <div className={styles.imageBox}>
        {loading ? (
          <Skeleton
            width="100%"
            height="100%"
            className={styles.mediaLoading}
          />
        ) : (
          item?.imageURL && (
            <Suspense
              fallback={
                <Loader
                  type="Oval"
                  color="#007BFF"
                  height={32}
                  width={32}
                  className={styles.loader}
                />
              }
            >
              <SuspenseImg
                src={
                  item.thumbnailPath?.length > 10
                    ? `https://storage.artion.io/image/${item.thumbnailPath}`
                    : item.imageURL
                }
                className={styles.media}
                alt={item.name}
              />
            </Suspense>
          )
        )}
      </div>
      <div className={styles.itemName}>{item.name}</div>
    </div>
  );
};

const NewBundleModal = ({
  visible,
  onClose,
  items,
  onLoadNext,
  onCreateSuccess = () => {},
}) => {
  const { account } = useWeb3React();

  const rootRef = useRef(null);

  const selected = useRef([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [creating, setCreating] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [approved, setApproved] = useState(true);
  const [approving, setApproving] = useState(false);

  const { authToken } = useSelector(state => state.ConnectWallet);
  const { price: ftmPrice } = useSelector(state => state.Price);

  useEffect(() => {
    if (visible) {
      selected.current = [];
      setName('');
      setPrice('');
    }
  }, [visible]);

  const getContractApprovedStatus = async () => {
    setLoadingStatus(true);
    let contractAddresses = selected.current.map(
      idx => items[idx].contractAddress
    );
    contractAddresses = contractAddresses.filter(
      (addr, idx) => contractAddresses.indexOf(addr) === idx
    );
    let approved = true;
    try {
      await Promise.all(
        contractAddresses.map(async address => {
          const contract = await getNFTContract(address);
          try {
            const _approved = await contract.isApprovedForAll(
              account,
              BUNDLE_SALES_CONTRACT_ADDRESS
            );
            approved = approved && _approved;
          } catch (e) {
            console.log(e);
          }
        })
      );
    } catch (e) {
      console.log(e);
    }
    setApproved(approved);
    setLoadingStatus(false);
  };

  const isValid = () => {
    return name && price && selected.current.length;
  };

  const closeModal = () => {
    onClose();
  };

  const handleScroll = e => {
    const obj = e.currentTarget;
    if (obj.scrollHeight - obj.clientHeight - obj.scrollTop < 100) {
      onLoadNext();
    }
  };

  const handleItemClick = idx => {
    const index = selected.current.indexOf(idx);
    if (index > -1) {
      selected.current.splice(index, 1);
    } else {
      selected.current.push(idx);
    }
    getContractApprovedStatus();
  };

  const onApprove = async () => {
    setApproving(true);
    let contractAddresses = selected.current.map(
      idx => items[idx].contractAddress
    );
    contractAddresses = contractAddresses.filter(
      (addr, idx) => contractAddresses.indexOf(addr) === idx
    );
    try {
      await Promise.all(
        contractAddresses.map(async address => {
          const contract = await getNFTContract(address);
          const _approved = await contract.isApprovedForAll(
            account,
            BUNDLE_SALES_CONTRACT_ADDRESS
          );
          if (!_approved) {
            const tx = await contract.setApprovalForAll(
              BUNDLE_SALES_CONTRACT_ADDRESS,
              true
            );
            await tx.wait();
          }
        })
      );
    } catch (e) {
      console.log(e);
    }
    setApproved(true);
    setApproving(false);
  };

  const onCreate = async () => {
    if (creating) return;

    let bundleID;
    const selectedItems = [];
    try {
      setCreating(true);

      for (let i = 0; i < selected.current.length; i++) {
        const item = items[selected.current[i]];
        selectedItems.push({
          address: item.contractAddress,
          tokenID: item.tokenID,
          supply: item?.holderSupply || item?.supply || 1,
        });
      }
      const { data } = await createBundle(
        name,
        parseFloat(price),
        selectedItems,
        authToken
      );
      bundleID = data;
    } catch {
      setCreating(false);
    }

    try {
      const tx = await listBundle(
        bundleID,
        selectedItems.map(item => item.address),
        selectedItems.map(item => item.tokenID),
        selectedItems.map(item => item.supply),
        ethers.utils.parseEther(price),
        ethers.BigNumber.from(Math.floor(new Date().getTime() / 1000)),
        '0x0000000000000000000000000000000000000000'
      );
      await tx.wait();

      toast('success', 'Bundle created successfully!');
      setCreating(false);

      closeModal();
      onCreateSuccess();
    } catch {
      setCreating(false);
      try {
        await deleteBundle(bundleID, authToken);
      } catch (e) {
        console.log(e);
      }
    }
  };

  const onCancel = () => {
    closeModal();
  };

  if (!visible) return null;

  return (
    <div className={styles.root} ref={rootRef}>
      <Modal open className={styles.modal} container={() => rootRef.current}>
        <div className={styles.paper}>
          <h2 className={styles.title}>Create Bundle</h2>
          <div className={styles.formGroup}>
            <p className={styles.formLabel}>Name</p>
            <div className={styles.formInputCont}>
              <input
                type="text"
                className={styles.formInput}
                maxLength={20}
                placeholder="Bundle Name"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className={styles.lengthIndicator}>{name.length}/20</div>
          </div>
          <div className={styles.formGroup}>
            <div className={styles.formLabel}>Price</div>
            <div className={styles.formInputCont}>
              <input
                className={styles.formInput}
                placeholder="0.00"
                value={price}
                onChange={e =>
                  setPrice(isNaN(e.target.value) ? price : e.target.value)
                }
                disabled={creating}
              />
              <div className={styles.usdPrice}>
                ${((parseFloat(price) || 0) * ftmPrice).toFixed(2)}
              </div>
            </div>
          </div>
          <div className={styles.formGroup}>
            <p className={styles.formLabel}>Items</p>
            <div className={styles.itemList} onScroll={handleScroll}>
              {items.map((item, idx) => (
                <NFTItem
                  key={idx}
                  item={item}
                  onClick={() => handleItemClick(idx)}
                  selected={selected.current.indexOf(idx) > -1}
                />
              ))}
            </div>
          </div>

          <div className={styles.footer}>
            <div
              className={cx(
                styles.button,
                styles.save,
                (creating || loadingStatus || approving || !isValid()) &&
                  styles.disabled
              )}
              onClick={
                isValid() && !creating && !loadingStatus && !approving
                  ? approved
                    ? onCreate
                    : onApprove
                  : null
              }
            >
              {creating || loadingStatus || approving ? (
                <ClipLoader color="#FFF" size={16} />
              ) : approved ? (
                'Create'
              ) : (
                'Approve Items'
              )}
            </div>

            <div
              className={cx(
                styles.button,
                styles.cancel,
                creating && styles.disabled
              )}
              onClick={!creating ? onCancel : null}
            >
              Cancel
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default NewBundleModal;